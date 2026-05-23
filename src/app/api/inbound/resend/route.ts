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
    // sigHeader is space-separated list of "v1,<base64>" entries
    return sigHeader.split(' ').some(s => s.split(',')[1] === expected);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Fetch webhook secret
  const { data: setting } = await supabase
    .from('settings').select('value').eq('key', 'resend_webhook_secret').single();
  const webhookSecret = setting?.value ?? '';

  // 2. Verify Svix signature if secret is configured
  if (webhookSecret) {
    const svixId  = req.headers.get('svix-id') ?? '';
    const svixTs  = req.headers.get('svix-timestamp') ?? '';
    const svixSig = req.headers.get('svix-signature') ?? '';
    if (!svixId || !svixTs || !svixSig || !verifySvix(webhookSecret, svixId, svixTs, rawBody, svixSig)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // 3. Resend wraps inbound in payload.data; fallback to root
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const from    = (data.from as string) ?? '';
  const toArr   = Array.isArray(data.to) ? (data.to as string[]) : [(data.to as string) ?? ''];
  const subject = (data.subject as string) ?? '';
  const text    = (data.text as string) ?? (data.html as string) ?? '';
  const hdrs    = (data.headers as Array<{ name: string; value: string }>) ?? [];

  // 4. Anti-loop guards
  const fromLow = from.toLowerCase();
  if (LOOP_SENDERS.some(s => fromLow.includes(s))) {
    return NextResponse.json({ ok: true, skipped: 'loop-sender' });
  }
  if (hdrs.some(h => h.name.toLowerCase() === 'auto-submitted')) {
    return NextResponse.json({ ok: true, skipped: 'auto-submitted' });
  }

  // 5. Extract lead_id from To (inbound+<uuid>@domain)
  const rawTo = toArr[0] ?? '';
  const match = rawTo.match(/inbound\+([^@]+)@/);
  if (!match?.[1]) return NextResponse.json({ ok: true, skipped: 'no-lead-id' });
  const leadId = match[1];

  // 6. Fetch lead
  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
  if (!lead) return NextResponse.json({ ok: true, skipped: 'lead-not-found' });

  // 7. Rate limit: max 3 inbound from same lead in last 2 hours
  const since = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('direction', 'inbound')
    .gte('created_at', since);
  if ((count ?? 0) >= 3) return NextResponse.json({ ok: true, skipped: 'rate-limit' });

  // 8. Save inbound conversation
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({
      lead_id: leadId,
      channel: 'email',
      direction: 'inbound',
      content: text.slice(0, 5000),
      ai_generated: false,
      metadata: { from, subject, raw_to: rawTo }
    })
    .select()
    .single();
  if (convErr || !conv) {
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  // 9. Classify via Groq
  let classification;
  try {
    const leadName = lead.company_name ?? lead.contact_name ?? '';
    classification = await classifyInboundEmail(text, leadName, lead.segment ?? '');
  } catch {
    await supabase.from('conversations')
      .update({ awaiting_human: true, intent: 'unknown', confidence: 0 })
      .eq('id', conv.id);
    await logEvent({ entity_type: 'conversation', entity_id: conv.id, action: 'classify_failed', metadata: { fallback: 'awaiting_human' } });
    return NextResponse.json({ ok: true, action: 'manual-fallback' });
  }

  const { intent, confidence, suggested_reply, should_auto_reply } = classification;
  const leadName = lead.company_name ?? lead.contact_name ?? 'Lead';

  if (should_auto_reply) {
    // 10a. Auto-reply
    try {
      await sendEmail({ to: from, subject: `Re: ${subject}`, body: suggested_reply });
      await supabase.from('conversations')
        .update({ intent, confidence, suggested_reply, auto_replied: true, awaiting_human: false })
        .eq('id', conv.id);
      await supabase.from('conversations').insert({
        lead_id: leadId, channel: 'email', direction: 'outbound',
        content: suggested_reply, ai_generated: true,
        metadata: { in_reply_to: conv.id }
      });
      await logEvent({ entity_type: 'conversation', entity_id: conv.id, action: 'auto_replied', metadata: { intent, confidence } });
      return NextResponse.json({ ok: true, action: 'auto-reply' });
    } catch {
      // Auto-reply failed — fall through to manual
    }
  }

  // 10b. Flag for human review + notify Polyana
  await supabase.from('conversations')
    .update({ intent, confidence, suggested_reply, awaiting_human: true })
    .eq('id', conv.id);

  const notifyBody = [
    `${leadName} respondeu seu email.`,
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
      subject: `💬 Resposta de ${leadName} — ação necessária`,
      body: notifyBody
    });
  } catch { /* notificação falhou — não bloqueia */ }

  await logEvent({ entity_type: 'conversation', entity_id: conv.id, action: 'awaiting_human', metadata: { intent, confidence } });
  return NextResponse.json({ ok: true, action: 'manual' });
}
