import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/logger';
import { llmJSON } from '@/lib/llm';
import { sdrSystemPrompt, sdrFirstTouchPrompt } from '@/lib/prompts';
import { sendEmail, sendWhatsApp } from '@/lib/providers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  lead_id: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp']),
  dry_run: z.boolean().default(false),
  skip_send: z.boolean().default(false),
  prewritten_subject: z.string().optional(),
  prewritten_body: z.string().optional(),
  touch_number: z.number().optional().default(1)
});

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());

    const { data: lead, error: leadErr } = await supabase
      .from('leads').select('*').eq('id', body.lead_id).single();
    if (leadErr || !lead) {
      return NextResponse.json({ error: 'lead não encontrado' }, { status: 404 });
    }

    // valida canal
    if (body.channel === 'email' && !lead.email) {
      return NextResponse.json({ error: 'lead sem email' }, { status: 400 });
    }
    if (body.channel === 'whatsapp' && !lead.whatsapp && !lead.phone) {
      return NextResponse.json({ error: 'lead sem whatsapp' }, { status: 400 });
    }

    // D0: usa template fixo do settings em vez de chamar IA
    if ((!body.touch_number || body.touch_number === 1) && !body.prewritten_body) {
      const [subjectRow, bodyRow] = await Promise.all([
        supabase.from('settings').select('value').eq('key', 'email_template_d0_subject').single(),
        supabase.from('settings').select('value').eq('key', 'email_template_d0_body').single()
      ]);
      const contactName = lead.contact_name?.trim() || `equipe da ${lead.company_name}`;
      const subject = (subjectRow.data?.value || 'Dúvida sobre {{company_name}}')
        .replace(/{{company_name}}/g, lead.company_name || '')
        .replace(/{{contact_name}}/g, contactName);
      const tmplBody = (bodyRow.data?.value || '')
        .replace(/{{company_name}}/g, lead.company_name || '')
        .replace(/{{contact_name}}/g, contactName);
      if (body.dry_run) return NextResponse.json({ preview: { subject, body: tmplBody }, dry_run: true });
      // para envio real, injeta como prewritten para o fluxo normal abaixo
      body.prewritten_subject = subject;
      body.prewritten_body    = tmplBody;
    }

    // usa texto pré-escrito (editado no modal) ou gera via IA
    const aiResult: { subject?: string; body: string } = body.prewritten_body
      ? { subject: body.prewritten_subject, body: body.prewritten_body }
      : await llmJSON<{ subject?: string; body: string }>([
          { role: 'system', content: sdrSystemPrompt() },
          { role: 'user', content: sdrFirstTouchPrompt(lead, body.channel) }
        ], { temperature: 0.8, max_tokens: 500 });

    if (body.dry_run) {
      return NextResponse.json({ preview: aiResult, dry_run: true });
    }

    // whatsapp manual: grava como enviado sem chamar provider
    if (body.skip_send) {
      const { data: outreach, error: orErr } = await supabase
        .from('outreach').insert({
          lead_id: lead.id,
          channel: body.channel,
          direction: 'outbound',
          message: aiResult.body,
          status: 'sent',
          provider: 'whatsapp_manual',
          sent_at: new Date().toISOString()
        }).select().single();
      if (orErr) throw orErr;
      await supabase.from('leads').update({ status: 'contacted' }).eq('id', lead.id);
      await logEvent({
        entity_type: 'outreach', entity_id: outreach.id,
        action: 'sent', actor: 'ai',
        metadata: { channel: body.channel, provider: 'whatsapp_manual' }
      });
      return NextResponse.json({ ok: true, preview: aiResult });
    }

    // grava outreach (pending)
    const { data: outreach, error: orErr } = await supabase
      .from('outreach').insert({
        lead_id: lead.id,
        channel: body.channel,
        direction: 'outbound',
        subject: aiResult.subject ?? null,
        message: aiResult.body,
        status: 'pending'
      }).select().single();
    if (orErr) throw orErr;

    // modo simulado quando RESEND_API_KEY é placeholder
    if (process.env.RESEND_API_KEY === 'placeholder') {
      await supabase.from('outreach').update({
        status: 'simulated', provider: 'simulated', sent_at: new Date().toISOString()
      }).eq('id', outreach.id);
      await supabase.from('leads').update({ status: 'contacted' }).eq('id', lead.id);
      await logEvent({
        entity_type: 'outreach', entity_id: outreach.id,
        action: 'sent', actor: 'ai',
        metadata: { channel: body.channel, provider: 'simulated', simulated: true }
      });
      return NextResponse.json({ ok: true, outreach_id: outreach.id, preview: aiResult, provider: 'simulated', simulated: true });
    }

    // envia
    let providerId = '';
    let providerName = '';
    try {
      if (body.channel === 'email') {
        const r = await sendEmail({
          to: lead.email!,
          subject: aiResult.subject ?? 'Olá',
          body: aiResult.body
        });
        providerId = r.id;
        providerName = 'brevo';
      } else {
        const r = await sendWhatsApp({
          to: lead.whatsapp ?? lead.phone!,
          body: aiResult.body
        });
        providerId = r.id;
        providerName = r.id.startsWith('wa.me-fallback') ? 'wa.me' : 'evolution';
      }
    } catch (sendErr: any) {
      await supabase.from('outreach').update({
        status: 'failed', error: sendErr.message
      }).eq('id', outreach.id);
      await logEvent({
        entity_type: 'outreach', entity_id: outreach.id,
        action: 'send_failed',
        metadata: { error: sendErr.message }
      });
      return NextResponse.json({ error: 'falha no envio: ' + sendErr.message }, { status: 502 });
    }

    // marca como enviado
    await supabase.from('outreach').update({
      status: 'sent', provider: providerName, provider_id: providerId, sent_at: new Date().toISOString()
    }).eq('id', outreach.id);

    // atualiza status do lead
    await supabase.from('leads').update({ status: 'contacted' }).eq('id', lead.id);

    await logEvent({
      entity_type: 'outreach', entity_id: outreach.id,
      action: 'sent', actor: 'ai',
      metadata: { channel: body.channel, provider: providerName, provider_id: providerId }
    });

    return NextResponse.json({
      ok: true,
      outreach_id: outreach.id,
      preview: aiResult,
      provider: providerName,
      provider_id: providerId
    });
  } catch (err: any) {
    console.error('[outreach/send] erro:', err);
    return NextResponse.json({ error: err.message ?? 'erro interno' }, { status: 500 });
  }
}
