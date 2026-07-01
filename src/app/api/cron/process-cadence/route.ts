import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/logger';
import { llmJSON, LLMError } from '@/lib/llm';
import { RateGuardError } from '@/lib/rateGuard'; // ★★
import { sdrSystemPrompt, sdrTouchPrompt } from '@/lib/prompts';
import { sendEmail } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TIME_BUDGET_MS = 50_000;

export async function GET(req: Request) {
  const startedAt = Date.now();

  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[process-cadence] iniciando', new Date().toISOString());

  const { data: cfg } = await supabase
    .from('cadence_config')
    .select('ativo, limite_por_execucao')
    .eq('id', 1)
    .single();

  if (!cfg?.ativo) {
    console.log('[process-cadence] cadência DESATIVADA — nada a fazer');
    return NextResponse.json({ skipped: true, reason: 'cadencia desativada' });
  }
  const limite = cfg.limite_por_execucao ?? 50;

  const { data: stepsRows } = await supabase
    .from('cadence_steps')
    .select('*')
    .order('step_number', { ascending: true });
  const steps = stepsRows ?? [];
  const stepByNumber = new Map(steps.map((s) => [s.step_number, s]));
  const maxStep = steps.length > 0 ? Math.max(...steps.map((s) => s.step_number)) : 1;

  const now = new Date().toISOString();

  const { data: queue, error } = await supabase
    .from('outreach')
    .select('*')
    .or(`status.eq.pending,and(status.eq.scheduled,scheduled_at.lte.${now})`)
    .order('scheduled_at', { ascending: true })
    .limit(limite);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0, cancelled = 0, failed = 0, deferred = 0;
  let stoppedBySaturation = false;

  for (const item of queue ?? []) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      stoppedBySaturation = true;
      break;
    }

    const { data: lead } = await supabase
      .from('leads').select('*').eq('id', item.lead_id).single();

    if (!lead || !['new', 'contacted'].includes(lead.status) || lead.human_takeover) {
      await supabase.from('outreach').update({ status: 'cancelled' }).eq('id', item.id);
      cancelled++;
      continue;
    }

    try {
      const touchNumber = (item.touch_number ?? 1) as number;
      const step = stepByNumber.get(touchNumber);

      if (!step || !step.ativo) {
        await supabase.from('outreach').update({ status: 'cancelled' }).eq('id', item.id);
        cancelled++;
        continue;
      }

      const contactName = lead.contact_name?.trim() || `equipe da ${lead.company_name}`;
      let subject: string;
      let body: string;

      if (step.modo_texto === 'template') {
        subject = (step.subject || 'Contato — Gráfica Liderset')
          .replace(/{{company_name}}/g, lead.company_name)
          .replace(/{{contact_name}}/g, contactName);
        body = (step.body || '')
          .replace(/{{company_name}}/g, lead.company_name)
          .replace(/{{contact_name}}/g, contactName);
      } else {
        const aiResult = await llmJSON<{ subject?: string; body: string }>([
          { role: 'system', content: sdrSystemPrompt() },
          { role: 'user', content: sdrTouchPrompt(lead, item.channel, touchNumber as 1 | 2 | 3) },
        ], { temperature: 0.8, max_tokens: 500 });
        subject = aiResult.subject ?? `Toque ${touchNumber} — Gráfica Liderset`;
        body = aiResult.body;
      }

      let providerId = '';
      if (item.channel === 'email' && lead.email) {
        const r = await sendEmail({
          to: lead.email,
          subject,
          body,
          replyTo: `inbound+${lead.id}@liderset.com`,
        });
        providerId = r.id;
      }

      const sentAt = new Date().toISOString();

      await supabase.from('outreach').update({
        status: 'sent',
        provider: 'resend',
        provider_id: providerId,
        subject,
        message: body,
        sent_at: sentAt,
      }).eq('id', item.id);

      if (lead.status === 'new') {
        await supabase.from('leads').update({ status: 'contacted' }).eq('id', lead.id);
      }

      await logEvent({
        entity_type: 'outreach', entity_id: item.id,
        action: 'sent', actor: 'cadence',
        metadata: { touch_number: touchNumber, channel: item.channel, provider_id: providerId },
      });

      sent++;

      const nextNumber = touchNumber + 1;
      const nextStep = stepByNumber.get(nextNumber);
      if (nextStep && nextStep.ativo && nextNumber <= maxStep) {
        try {
          const { data: existing } = await supabase
            .from('outreach')
            .select('id')
            .eq('lead_id', item.lead_id)
            .eq('touch_number', nextNumber)
            .maybeSingle();

          if (!existing) {
            const dias = nextStep.dias_apos ?? 10;
            const scheduledAt = new Date(new Date(sentAt).getTime() + dias * 864e5).toISOString();
            await supabase.from('outreach').insert({
              lead_id: item.lead_id,
              channel: item.channel,
              touch_number: nextNumber,
              status: 'scheduled',
              scheduled_at: scheduledAt,
            });
          }
        } catch (schedErr: unknown) {
          await logEvent({
            entity_type: 'outreach', entity_id: item.id,
            action: 'schedule_next_failed',
            metadata: { next_touch: nextNumber, error: schedErr instanceof Error ? schedErr.message : String(schedErr) },
          });
        }
      }
    } catch (err: unknown) {
      // ★★ saturação da barreira OU 429/5xx/rede = transitório → re-agenda, não queima
      const isTransient =
        (err instanceof LLMError && err.transient) ||
        err instanceof RateGuardError;
      const message = err instanceof Error ? err.message : String(err);

      if (isTransient) {
        await supabase.from('outreach').update({
          status: 'scheduled',
          scheduled_at: new Date().toISOString(),
        }).eq('id', item.id);

        await logEvent({
          entity_type: 'outreach', entity_id: item.id,
          action: 'send_deferred',
          metadata: { reason: 'rate_limit_or_transient', error: message },
        });

        deferred++;
        stoppedBySaturation = true;
        break;
      }

      await supabase.from('outreach').update({ status: 'failed', error: message }).eq('id', item.id);
      await logEvent({
        entity_type: 'outreach', entity_id: item.id,
        action: 'send_failed',
        metadata: { error: message },
      });
      failed++;
    }
  }

  const processed = (queue ?? []).length;
  return NextResponse.json({
    processed, sent, cancelled, failed, deferred, limite,
    stopped_by_saturation: stoppedBySaturation,
  });
}
