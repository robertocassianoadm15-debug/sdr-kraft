import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ── Configuração ──────────────────────────────────────────────
const ALERT_TO = ['roberto@escardcartoes.com.br', 'polyana@liderset.com.br']; // ← emails que recebem o resumo

export async function GET(req: Request) {
  // Mesma auth dos outros crons
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const h48 = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const h6  = new Date(now.getTime() - 6  * 3600 * 1000).toISOString();

  // ── Coleta os 4 sinais (só leitura) ──────────────────────────
  const checks: { label: string; value: number | string; ok: boolean; detail: string }[] = [];

  try {
    // 1. Inbounds nas últimas 48h (o bug que custou 11 dias)
    const { count: inbound48 } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .gte('created_at', h48);
    checks.push({
      label: 'Respostas recebidas (48h)',
      value: inbound48 ?? 0,
      ok: (inbound48 ?? 0) > 0,
      detail: (inbound48 ?? 0) > 0 ? 'fluxo de inbound ativo' : '⚠️ NENHUMA resposta em 48h — verificar receiving/MX',
    });

    // 2. Envios nas últimas 24h
    const { count: sent24 } = await supabase
      .from('outreach')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', h24);
    checks.push({
      label: 'Emails enviados (24h)',
      value: sent24 ?? 0,
      ok: (sent24 ?? 0) > 0,
      detail: (sent24 ?? 0) > 0 ? 'cron de envio funcionando' : '⚠️ ZERO envios em 24h — cron pode ter parado',
    });

    // 3. Falhas recentes (status failed nas últimas 24h)
    const { count: failed24 } = await supabase
      .from('outreach')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', h24);
    checks.push({
      label: 'Envios falhados (24h)',
      value: failed24 ?? 0,
      ok: (failed24 ?? 0) === 0,
      detail: (failed24 ?? 0) === 0 ? 'sem falhas de envio' : `⚠️ ${failed24} envios falharam — verificar logs`,
    });

    // 4. Falhas de agendamento do próximo toque (6h)
    const { count: schedFail } = await supabase
      .from('event_log')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'schedule_next_failed')
      .gte('created_at', h6);
    checks.push({
      label: 'Falhas de agendamento (6h)',
      value: schedFail ?? 0,
      ok: (schedFail ?? 0) === 0,
      detail: (schedFail ?? 0) === 0 ? 'cadência encadeando normal' : `⚠️ ${schedFail} follow-ups não foram agendados`,
    });

    // 5. Fila futura (sanity: tem follow-up agendado pra frente?)
    const { count: queued } = await supabase
      .from('outreach')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .gt('scheduled_at', now.toISOString());
    checks.push({
      label: 'Follow-ups na fila (futuros)',
      value: queued ?? 0,
      ok: true, // informativo, não dispara alerta
      detail: `${queued ?? 0} toques agendados adiante`,
    });

  } catch (err: any) {
    // Se a própria coleta falhar, isso JÁ é um alerta crítico
    for (const dest of ALERT_TO) {
      try {
        await sendEmail({
          to: dest,
          subject: '🔴 SDR-KRAFT health-check FALHOU ao coletar dados',
          body: `O health-check não conseguiu ler o banco.\n\nErro: ${err?.message ?? String(err)}\n\nHorário: ${now.toISOString()}`,
        });
      } catch { /* não bloqueia os demais destinatários */ }
    }
    return NextResponse.json({ ok: false, error: 'coleta falhou', detail: err?.message }, { status: 500 });
  }

  // ── Determina status geral ───────────────────────────────────
  const problemas = checks.filter(c => !c.ok);
  const tudoOk = problemas.length === 0;
  const emoji = tudoOk ? '🟢' : '🔴';

  // ── Monta o corpo do email (texto puro, sendEmail converte) ──
  const linhas = checks.map(c => {
    const mark = c.ok ? '✅' : '🔴';
    return `${mark} ${c.label}: ${c.value}\n     ${c.detail}`;
  }).join('\n\n');

  const destaque = tudoOk
    ? 'Todos os sinais saudáveis.'
    : `ATENÇÃO — ${problemas.length} problema(s):\n` + problemas.map(p => `  • ${p.label}: ${p.detail}`).join('\n');

  const body =
`SDR-KRAFT — Resumo de Saúde
${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (BRT)

${destaque}

──────────────────────────────
${linhas}
──────────────────────────────

Verificação automática a cada 6h.`;

  // ── Envia o resumo (sempre, conforme decisão) ────────────────
  const enviados: string[] = [];
  const falhasEnvio: string[] = [];
  for (const dest of ALERT_TO) {
    try {
      await sendEmail({
        to: dest,
        subject: `${emoji} SDR-KRAFT Saúde — ${tudoOk ? 'tudo ok' : `${problemas.length} alerta(s)`}`,
        body,
      });
      enviados.push(dest);
    } catch (err: any) {
      // Não falha o cron se um email não sair — registra e segue
      falhasEnvio.push(dest);
    }
  }

  return NextResponse.json({
    ok: true,
    status: tudoOk ? 'healthy' : 'degraded',
    emailsEnviados: enviados,
    emailsFalhados: falhasEnvio,
    checks,
  });
}
