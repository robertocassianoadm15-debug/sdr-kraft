// ============================================================
// src/app/api/blast/send/route.ts
// Dispara um lote. Só aceita lote 'draft', 'confirmed' ou 'sending'.
// - Email: envia DE VERDADE via Resend (HTML com imagens inline).
// - WhatsApp (Modo B): gera links wa.me; NÃO envia, devolve a lista
//   para o operador clicar e enviar manualmente.
// Idempotente: alvos já 'sent' são pulados em reprocessamento.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { config } from '@/lib/config';
import { buildWaMeLink, buildEmailHtmlWithImages } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMAIL_DELAY_MS = 600;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function sendEmailWithImages(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY || config.email.apiKey;
  if (!apiKey) throw new Error('RESEND_API_KEY não configurado');

  const fromEmail = config.email.fromEmail.toLowerCase().trim();
  const fromName  = config.email.fromName;
  const replyTo   = (config.email.replyTo || fromEmail).toLowerCase().trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to.toLowerCase().trim()],
      reply_to: replyTo,
      subject,
      html
    })
  });

  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.id ?? 'sent';
}

export async function POST(req: NextRequest) {
  let batch_id: string;
  try {
    ({ batch_id } = await req.json());
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!batch_id) return NextResponse.json({ error: 'batch_id obrigatório' }, { status: 400 });

  const { data: batch, error: batchErr } = await supabase
    .from('blast_batches').select('*').eq('id', batch_id).single();
  if (batchErr || !batch) return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 });

  if (!['draft', 'confirmed', 'sending'].includes(batch.status))
    return NextResponse.json({ error: `Lote em status '${batch.status}' não pode ser disparado` }, { status: 409 });

  await supabase.from('blast_batches').update({ status: 'sending' }).eq('id', batch_id);

  const { data: targets } = await supabase
    .from('blast_targets').select('*').eq('batch_id', batch_id).eq('status', 'pending');

  const imageUrls: string[] = Array.isArray(batch.image_urls) ? batch.image_urls : [];
  let sent = 0, failed = 0;
  const waLinks: { company_lead_id: string; to: string; link: string }[] = [];

  if (batch.channel === 'email') {
    const html = buildEmailHtmlWithImages(batch.body, imageUrls);
    for (const t of targets ?? []) {
      if (!t.to_email) {
        await supabase.from('blast_targets').update({ status: 'skipped', error: 'sem email' }).eq('id', t.id);
        continue;
      }
      try {
        const id = await sendEmailWithImages(t.to_email, batch.subject ?? '', html);
        await supabase.from('blast_targets').update({
          status: 'sent', provider_id: id, sent_at: new Date().toISOString()
        }).eq('id', t.id);
        sent++;
      } catch (err: any) {
        await supabase.from('blast_targets').update({
          status: 'failed', error: String(err?.message ?? err).slice(0, 200)
        }).eq('id', t.id);
        failed++;
      }
      await sleep(EMAIL_DELAY_MS);
    }
  }

  if (batch.channel === 'whatsapp') {
    for (const t of targets ?? []) {
      if (!t.to_whatsapp) {
        await supabase.from('blast_targets').update({ status: 'skipped', error: 'sem whatsapp' }).eq('id', t.id);
        continue;
      }
      const link = buildWaMeLink({ to: t.to_whatsapp, body: batch.body });
      await supabase.from('blast_targets').update({
        status: 'sent', provider_id: link, sent_at: new Date().toISOString()
      }).eq('id', t.id);
      waLinks.push({ company_lead_id: t.lead_id, to: t.to_whatsapp, link });
      sent++;
    }
  }

  await supabase.from('blast_batches').update({
    status: 'sent', sent_at: new Date().toISOString()
  }).eq('id', batch_id);

  await supabase.from('event_log').insert({
    entity_type: 'blast', action: 'blast_sent', actor: 'operador',
    metadata: { batch_id, channel: batch.channel, sent, failed }
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok: true,
    channel: batch.channel,
    sent,
    failed,
    wa_links: batch.channel === 'whatsapp' ? waLinks : undefined,
    note: batch.channel === 'whatsapp'
      ? 'Links gerados. Clique em cada um para abrir o WhatsApp com a mensagem pronta. Anexe as imagens manualmente.'
      : 'Emails enviados via Resend.'
  });
}
