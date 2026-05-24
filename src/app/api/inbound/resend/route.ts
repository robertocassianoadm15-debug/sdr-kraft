import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';
import { classifyInboundEmail } from '@/lib/classifier';
import { sendEmail } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processInboundEmail(payload: any) {
  const data = payload.data;
  const emailId = data?.email_id;
  if (!emailId) return;

  const { data: existing } = await supabase
    .from('conversations').select('id')
    .contains('metadata', { email_id: emailId }).maybeSingle();
  if (existing) return;

  const { data: keyRow } = await supabase
    .from('settings').select('value').eq('key', 'resend_api_key').single();
  const apiKey = keyRow?.value;
  if (!apiKey) throw new Error('resend_api_key missing');

  const resend = new Resend(apiKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const got: any = await resend.emails.receiving.get(emailId);
  const detail = got?.data ?? got;
  if (!detail) return;

  const rawText = detail.text || '';
  const rawHtml = detail.html || '';
  const stripped = rawText || rawHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const text = stripped.trim();
  console.log('[INBOUND] keys:', Object.keys(detail), 'textLen:', text.length);
  if (text.length < 3) return;

  const from = data.from || detail.from || '';
  const toArr = Array.isArray(data.to) ? data.to : [data.to];
  const to = String(toArr[0] || '');
  const subject = data.subject || detail.subject || '';

  const fl = from.toLowerCase();
  if (['noreply', 'mailer-daemon', 'postmaster', 'no-reply'].some(s => fl.includes(s))) return;

  const leadId = to.match(/inbound\+([^@]+)@/)?.[1];
  if (!leadId) return;

  const twoHrAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('conversations').select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId).eq('direction', 'inbound').gte('created_at', twoHrAgo);
  if ((count || 0) >= 3) return;

  const { data: lead } = await supabase
    .from('leads').select('id,company_name,segment,email,human_takeover').eq('id', leadId).single();
  if (!lead) return;

  const { data: conv } = await supabase.from('conversations').insert({
    lead_id: leadId, channel: 'email', direction: 'inbound',
    content: text.slice(0, 5000), ai_generated: false,
    metadata: { from, subject, raw_to: to, email_id: emailId }
  }).select().single();
  if (!conv) return;

  // Verifica se humano assumiu controle — bypassa IA
  if (lead.human_takeover) {
    await supabase.from('conversations').update({ awaiting_human: true, auto_replied: false }).eq('id', conv.id);
    await sendEmail({
      to: 'polyana@liderset.com.br',
      subject: `💬 [MANUAL] ${lead.company_name} respondeu`,
      body: `${lead.company_name} respondeu.\n\nVocê assumiu o controle desta conversa.\n\nResposta: ${text.slice(0, 500)}\n\nAprovar: https://sdr-kraft.vercel.app/inbox`
    });
    return;
  }

  const result = await classifyInboundEmail(text, lead.company_name || 'cliente', lead.segment || '');
  const auto = (result.intent === 'info_request' || result.intent === 'not_interested') && (result.confidence ?? 0) >= 80;

  await supabase.from('conversations').update({
    intent: result.intent, confidence: result.confidence,
    suggested_reply: result.suggested_reply,
    auto_replied: auto, awaiting_human: !auto,
  }).eq('id', conv.id);

  if (auto && lead.email) {
    await sendEmail({
      to: lead.email,
      subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
      body: result.suggested_reply,
      replyTo: `inbound+${leadId}@eiosteepix.resend.app`,
    });
    await supabase.from('conversations').insert({
      lead_id: leadId, channel: 'email', direction: 'outbound',
      content: result.suggested_reply, ai_generated: true,
    });
  } else {
    await sendEmail({
      to: 'polyana@liderset.com.br',
      subject: `💬 Resposta de ${lead.company_name} — ação necessária`,
      body: `${lead.company_name} respondeu.\n\nResposta: ${text.slice(0, 500)}\n\nIA (${result.intent}, ${result.confidence}%):\n${result.suggested_reply}\n\nhttps://sdr-kraft.vercel.app/inbox`
    });
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

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

  if (payload.type !== 'email.received') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await processInboundEmail(payload);
  } catch (err) {
    console.error('[inbound] processInboundEmail error:', err);
  }

  return NextResponse.json({ ok: true });
}
