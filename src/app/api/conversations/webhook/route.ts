/**
 * Webhook BDR autônomo.
 * Recebe respostas de leads (email reply / WhatsApp inbound) e responde via IA.
 *
 * No MVP, este endpoint pode ser chamado:
 *  - manualmente do painel (cole a resposta do lead)
 *  - por integração futura com Resend Inbound / Evolution webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/logger';
import { llmJSON } from '@/lib/llm';
import { bdrSystemPrompt, bdrConversationPrompt } from '@/lib/prompts';
import { sendEmail, sendWhatsApp } from '@/lib/providers';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  lead_id: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp']),
  inbound_message: z.string().min(1),
  secret: z.string().optional()
});

interface BDRResponse {
  reply: string;
  qualification_update: {
    has_budget: boolean | null;
    has_authority: boolean | null;
    has_need: boolean | null;
    has_timing: boolean | null;
    monthly_volume: number | null;
    bag_type: string | null;
    intent_score: number;
    notes: string;
  };
  next_status: 'replied' | 'qualified' | 'disqualified';
  should_handoff_human: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());

    // simple auth quando webhook for público
    const expected = process.env.WEBHOOK_SECRET;
    if (expected && body.secret !== expected) {
      // permite chamada interna do painel (sem secret) — fica como log
      console.warn('[bdr] sem secret válido — chamada interna?');
    }

    const { data: lead } = await supabase
      .from('leads').select('*').eq('id', body.lead_id).single();
    if (!lead) return NextResponse.json({ error: 'lead não encontrado' }, { status: 404 });

    // grava mensagem inbound
    await supabase.from('conversations').insert({
      lead_id: lead.id,
      channel: body.channel,
      direction: 'inbound',
      content: body.inbound_message,
      ai_generated: false
    });
    await logEvent({
      entity_type: 'conversation', entity_id: lead.id,
      action: 'inbound', metadata: { channel: body.channel }
    });

    // marca lead como replied
    await supabase.from('leads').update({ status: 'replied' }).eq('id', lead.id);

    // monta histórico completo
    const { data: history } = await supabase
      .from('conversations')
      .select('direction, content, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: true });

    // chama BDR
    const bdr = await llmJSON<BDRResponse>([
      { role: 'system', content: bdrSystemPrompt() },
      { role: 'user', content: bdrConversationPrompt(lead, history ?? []) }
    ], { temperature: 0.6, max_tokens: 800 });

    // envia resposta
    let providerId = 'skipped';
    let providerName = 'none';
    if (!bdr.should_handoff_human && bdr.reply) {
      try {
        if (body.channel === 'email' && lead.email) {
          const r = await sendEmail({
            to: lead.email,
            subject: 'Re: sacos kraft',
            body: bdr.reply
          });
          providerId = r.id;
          providerName = 'brevo';
        } else if (body.channel === 'whatsapp' && (lead.whatsapp || lead.phone)) {
          const r = await sendWhatsApp({
            to: lead.whatsapp ?? lead.phone!,
            body: bdr.reply
          });
          providerId = r.id;
          providerName = r.id.startsWith('wa.me-fallback') ? 'wa.me' : 'evolution';
        }
      } catch (e: any) {
        await logEvent({
          entity_type: 'conversation', entity_id: lead.id,
          action: 'bdr_send_failed', metadata: { error: e.message }
        });
      }
    }

    // grava outbound IA
    if (bdr.reply) {
      await supabase.from('conversations').insert({
        lead_id: lead.id,
        channel: body.channel,
        direction: 'outbound',
        content: bdr.reply,
        ai_generated: true,
        metadata: { provider: providerName, provider_id: providerId }
      });
    }

    // upsert qualification
    const q = bdr.qualification_update;
    const qualified =
      bdr.next_status === 'qualified' ||
      (q.has_need === true && (q.monthly_volume ?? 0) > 0);

    await supabase.from('qualifications').insert({
      lead_id: lead.id,
      has_budget: q.has_budget,
      has_authority: q.has_authority,
      has_need: q.has_need,
      has_timing: q.has_timing,
      monthly_volume: q.monthly_volume,
      bag_type: q.bag_type,
      intent_score: q.intent_score,
      notes: q.notes,
      qualified
    });

    // atualiza status final
    await supabase.from('leads').update({
      status: bdr.next_status,
      score: q.intent_score
    }).eq('id', lead.id);

    await logEvent({
      entity_type: 'lead', entity_id: lead.id,
      action: 'bdr_processed', actor: 'ai',
      metadata: {
        next_status: bdr.next_status,
        intent_score: q.intent_score,
        handoff: bdr.should_handoff_human
      }
    });

    return NextResponse.json({ ok: true, bdr });
  } catch (err: any) {
    console.error('[bdr webhook] erro:', err);
    return NextResponse.json({ error: err.message ?? 'erro interno' }, { status: 500 });
  }
}
