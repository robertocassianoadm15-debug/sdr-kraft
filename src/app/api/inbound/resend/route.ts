import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { classifyInboundEmail } from '@/lib/classifier';
import { sendEmail } from '@/lib/providers';
import { logEvent } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOOP_SENDERS = ['noreply', 'mailer-daemon', 'postmaster', 'no-reply', 'resend.app'];

function verifySvix(secret: string, msgId: string, timestamp: string, body: string, sigHeader: string): boolean {
  try {
    const keyBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto
      .createHmac('sha256', keyBytes)
      .update(`${msgId}.${timestamp}.${body}`)
      .digest('base64');
    return sigHeader.split(' ').some(s => s.split(',')[1] === expected);
  } catch {
    return false;
  }
}

// Suporta to: string | { email: string } | array de ambos
function extractEmail(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object' && 'email' in val) return (val as { email: string }).email;
  return '';
}

async function processInboundEmail(payload: Record<string, unknown>): Promise<void> {
  try {
    // Payload do Resend: { type, created_at, data: { email_id, from, to, subject, text, html } }
    const data    = (payload.data as Record<string, unknown>) ?? {};
    const emailId = (data.email_id as string) ?? '';
    const from    = (data.from as string) ?? '';
    const toRaw   = Array.isArray(data.to) ? data.to : [data.to];
    const toEmails = (toRaw as unknown[]).map(extractEmail);
    const subject = (data.subject as string) ?? '';
    const text    = (data.text as string) ?? (data.html as string) ?? '';
    const hdrs    = (data.headers as Array<{ name: string; value: string }>) ?? [];

    console.log('[INBOUND] Processando:', toEmails, from, 'email_id:', emailId);

    // Idempotência: ignorar retries do Resend para o mesmo email_id
    if (emailId) {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .contains('metadata', { email_id: emailId })
        .maybeSingle();
      if (existing) {
        console.log('[INBOUND] Email já processado, ignorando retry:', emailId);
        return;
      }
    }

    // Anti-loop guards
    const fromLow = from.toLowerCase();
    if (LOOP_SENDERS.some(s => fromLow.includes(s))) return;
    if (hdrs.some(h => h.name.toLowerCase() === 'auto-submitted')) return;

    // Extract lead_id from first To address containing 'inbound+'
    const inboundTo = toEmails.find(e => e.includes('inbound+')) ?? '';
    const match = inboundTo.match(/inbound\+([^@]+)@/);
    if (!match?.[1]) return;
    const leadId = match[1];

    // Fetch lead
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
    if (!lead) return;

    // Rate limit: max 3 inbound from same lead in last 2 hours
    const since = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const { count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', leadId)
      .eq('direction', 'inbound')
      .gte('created_at', since);
    if ((count ?? 0) >= 3) return;

    // Save inbound conversation (com email_id para idempotência futura)
    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        lead_id: leadId,
        channel: 'email',
        direction: 'inbound',
        content: text.slice(0, 5000),
        ai_generated: false,
        metadata: { from, subject, raw_to: inboundTo, email_id: emailId }
      })
      .select()
      .single();
    if (convErr || !conv) return;

    // Classify via Groq
    const leadName = lead.company_name ?? lead.contact_name ?? '';
    let classification;
    try {
      classification = await classifyInboundEmail(text, leadName, lead.segment ?? '');
    } catch {
      await supabase.from('conversations')
        .update({ awaiting_human: true, intent: 'unknown', confidence: 0 })
        .eq('id', conv.id);
      await logEvent({ entity_type: 'conversation', entity_id: conv.id, action: 'classify_failed', metadata: { fallback: 'awaiting_human' } });
      return;
    }

    const { intent, confidence, suggested_reply, should_auto_reply } = classification;
    const displayName = lead.company_name ?? lead.contact_name ?? 'Lead';

    if (should_auto_reply) {
      try {
        await sendEmail({
          to: from,
          subject: `Re: ${subject}`,
          body: suggested_reply,
          replyTo: `inbound+${leadId}@eiosteepix.resend.app`
        });
        await supabase.from('conversations')
          .update({ intent, confidence, suggested_reply, auto_replied: true, awaiting_human: false })
          .eq('id', conv.id);
        await supabase.from('conversations').insert({
          lead_id: leadId, channel: 'email', direction: 'outbound',
          content: suggested_reply, ai_generated: true,
          metadata: { in_reply_to: conv.id }
        });
        await logEvent({ entity_type: 'conversation', entity_id: conv.id, action: 'auto_replied', metadata: { intent, confidence } });
        return;
      } catch {
        // Auto-reply failed — fall through to manual
      }
    }

    // Flag for human review + notify Polyana
    await supabase.from('conversations')
      .update({ intent, confidence, suggested_reply, awaiting_human: true })
      .eq('id', conv.id);

    const notifyBody = [
      `${displayName} respondeu seu email.`,
      '',
      `Resposta deles: ${text.slice(0, 500)}${text.length > 500 ? '…' : ''}`,
      '',
      `Sugestão da IA (${intent}, ${confidence}% confiança):`,
      suggested_reply,
      '',
      'Acesse o painel para aprovar ou editar:',
      'https://sdr-kraft.vercel.app/inbox'
    ].join('\n');

    try {
      await sendEmail({
        to: 'polyana@liderset.com.br',
        subject: `💬 Resposta de ${displayName} — ação necessária`,
        body: notifyBody
      });
    } catch { /* notificação falhou — não bloqueia */ }

    await logEvent({ entity_type: 'conversation', entity_id: conv.id, action: 'awaiting_human', metadata: { intent, confidence } });

  } catch (err) {
    console.error('[inbound] processInboundEmail error:', err);
  }
}

// DEBUG TEMPORÁRIO — captura payload bruto para inspeção
// TODO: restaurar processInboundEmail() após confirmar estrutura do payload
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verificação de assinatura (mantém segurança)
  const { data: setting } = await supabase
    .from('settings').select('value').eq('key', 'resend_webhook_secret').single();
  const webhookSecret = setting?.value ?? '';

  if (webhookSecret) {
    const svixId  = req.headers.get('svix-id') ?? '';
    const svixTs  = req.headers.get('svix-timestamp') ?? '';
    const svixSig = req.headers.get('svix-signature') ?? '';
    if (!svixId || !svixTs || !svixSig || !verifySvix(webhookSecret, svixId, svixTs, rawBody, svixSig)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Salva payload bruto no banco para inspeção
  const emailId = (payload?.data as Record<string, unknown>)?.email_id as string | undefined;
  await supabase.from('event_log').insert({
    entity_type: 'debug',
    entity_id: emailId ?? null,
    action: 'inbound_raw_payload',
    actor: 'webhook',
    metadata: payload
  });

  console.log('[INBOUND DEBUG] payload keys:', Object.keys(payload));
  console.log('[INBOUND DEBUG] data keys:', payload.data ? Object.keys(payload.data as object) : 'sem data');

  return NextResponse.json({ ok: true });
}
