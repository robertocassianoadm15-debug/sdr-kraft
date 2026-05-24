import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchUnreadEmails } from '@/lib/imap-reader';
import { classifyInboundEmail } from '@/lib/classifier';
import { sendEmail } from '@/lib/providers';
import { logEvent } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOOP_SENDERS = ['noreply', 'mailer-daemon', 'postmaster', 'no-reply'];

async function processEmail(
  messageId: string,
  from: string,
  toEmails: string[],
  subject: string,
  text: string,
  headers: Array<{ name: string; value: string }>
): Promise<void> {
  // Idempotency: skip already-processed message_id
  if (messageId) {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .contains('metadata', { message_id: messageId })
      .maybeSingle();
    if (existing) return;
  }

  // Anti-loop guards
  const fromLow = from.toLowerCase();
  if (LOOP_SENDERS.some(s => fromLow.includes(s))) return;
  if (headers.some(h => h.name.toLowerCase() === 'auto-submitted')) return;

  // Extract lead_id from To address containing '+<lead_id>@gmail.com'
  const inboundTo = toEmails.find(e => e.includes('+') && e.includes('@gmail.com')) ?? '';
  const match = inboundTo.match(/\+([^@]+)@gmail\.com/);
  if (!match?.[1]) return;
  const leadId = match[1];

  // Fetch lead
  const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
  if (!lead) return;

  // Rate limit: max 3 inbound from same lead in 2 hours
  const since = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .eq('direction', 'inbound')
    .gte('created_at', since);
  if ((count ?? 0) >= 3) return;

  // Save inbound conversation
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({
      lead_id: leadId,
      channel: 'email',
      direction: 'inbound',
      content: text.slice(0, 5000),
      ai_generated: false,
      metadata: { from, subject, raw_to: inboundTo, message_id: messageId }
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
        replyTo: `robertocassianoadm15+${leadId}@gmail.com`
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
      // Fall through to manual review
    }
  }

  // Flag for human review + notify
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
}

export async function GET(req: NextRequest) {
  // Bearer auth from settings table
  const { data: setting } = await supabase
    .from('settings').select('value').eq('key', 'inbox_poll_secret').single();
  const secret = setting?.value ?? '';

  if (secret) {
    const authHeader = req.headers.get('authorization') ?? '';
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let emails;
  try {
    emails = await fetchUnreadEmails();
  } catch (err) {
    const errAny = err as Error;
    console.error('[POLL-INBOX] erro IMAP:', errAny);
    return NextResponse.json({
      error: 'imap_failed',
      message: errAny?.message || String(err),
      code: (errAny as any)?.code,
      response: (errAny as any)?.responseText,
      stack: errAny?.stack?.split('\n').slice(0, 5).join(' | ')
    }, { status: 500 });
  }

  let processed = 0;
  for (const email of emails) {
    try {
      await processEmail(
        email.messageId,
        email.from,
        email.to,
        email.subject,
        email.text,
        email.headers
      );
      processed++;
    } catch (err) {
      console.error('[poll-inbox] processEmail error:', err);
    }
  }

  return NextResponse.json({ ok: true, fetched: emails.length, processed });
}
