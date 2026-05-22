import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/logger';
import { llmJSON } from '@/lib/llm';
import { sdrSystemPrompt, sdrTouchPrompt } from '@/lib/prompts';
import { sendEmail } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  console.log('[process-cadence] iniciando', new Date().toISOString());
  const now = new Date().toISOString();

  const { data: queue, error } = await supabase
    .from('outreach')
    .select('*')
    .or(`status.eq.pending,and(status.eq.scheduled,scheduled_at.lte.${now})`)
    .order('scheduled_at', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0, cancelled = 0, failed = 0;

  for (const item of queue ?? []) {
    // Busca lead e decide se processa
    const { data: lead } = await supabase
      .from('leads').select('*').eq('id', item.lead_id).single();

    if (!lead || !['new', 'contacted'].includes(lead.status)) {
      await supabase.from('outreach').update({ status: 'cancelled' }).eq('id', item.id);
      cancelled++;
      continue;
    }

    try {
      const touchNumber = (item.touch_number ?? 1) as 1 | 2 | 3;

      const aiResult = await llmJSON<{ subject?: string; body: string }>([
        { role: 'system', content: sdrSystemPrompt() },
        { role: 'user',   content: sdrTouchPrompt(lead, item.channel, touchNumber) }
      ], { temperature: 0.8, max_tokens: 500 });

      // Envia — só email por enquanto na cadência automática
      let providerId = '';
      if (item.channel === 'email' && lead.email) {
        const r = await sendEmail({
          to:      lead.email,
          subject: aiResult.subject ?? `Toque ${touchNumber} — Gráfica Liderset`,
          body:    aiResult.body
        });
        providerId = r.id;
      }

      await supabase.from('outreach').update({
        status:      'sent',
        provider:    'brevo',
        provider_id: providerId,
        subject:     aiResult.subject ?? null,
        message:     aiResult.body,
        sent_at:     new Date().toISOString()
      }).eq('id', item.id);

      if (lead.status === 'new') {
        await supabase.from('leads').update({ status: 'contacted' }).eq('id', lead.id);
      }

      await logEvent({
        entity_type: 'outreach', entity_id: item.id,
        action: 'sent', actor: 'cadence',
        metadata: { touch_number: touchNumber, channel: item.channel, provider_id: providerId }
      });

      sent++;
    } catch (err: any) {
      await supabase.from('outreach').update({
        status: 'failed',
        error:  err.message
      }).eq('id', item.id);

      await logEvent({
        entity_type: 'outreach', entity_id: item.id,
        action: 'send_failed',
        metadata: { error: err.message }
      });

      failed++;
    }
  }

  const processed = (queue ?? []).length;
  return NextResponse.json({ processed, sent, cancelled, failed });
}
