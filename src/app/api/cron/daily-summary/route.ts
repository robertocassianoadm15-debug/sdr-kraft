import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Segurança: só Vercel Cron pode chamar
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)
  const dataStr = ontem.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const isoOntem = ontem.toISOString().split('T')[0]

  // Busca métricas do dia
  const [
    { count: enviados },
    { count: recebidos },
    { count: autoReplies },
    { count: manuais },
    { count: totalLeads },
    { count: novos },
    { count: pendentes }
  ] = await Promise.all([
    supabase.from('event_log').select('id', { count: 'exact', head: true })
      .eq('action', 'email_send_attempt')
      .gte('created_at', `${isoOntem}T00:00:00Z`)
      .lt('created_at', `${isoOntem}T23:59:59Z`),
    supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .gte('created_at', `${isoOntem}T00:00:00Z`),
    supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('auto_replied', true)
      .gte('created_at', `${isoOntem}T00:00:00Z`),
    supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('awaiting_human', true)
      .eq('read_by_human', false),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true })
      .eq('status', 'new'),
    supabase.from('conversations').select('id', { count: 'exact', head: true })
      .eq('awaiting_human', true)
      .eq('read_by_human', false)
  ])

  const body = `📊 SDR-KRAFT — Resumo ${dataStr}

✉️ Emails enviados: ${enviados || 0}
📥 Respostas recebidas: ${recebidos || 0}
🤖 Respondidas pela IA: ${autoReplies || 0}
👤 Aguardando Polyana: ${manuais || 0}

📈 Base total: ${totalLeads || 0} leads
🆕 Leads novos (aguardando D0): ${novos || 0}
⏳ Inbox pendente agora: ${pendentes || 0}

🔗 Acessar painel: https://sdr-kraft.vercel.app`

  // Envia para os dois
  await Promise.all([
    sendEmail({
      to: 'roberto@escardcartoes.com.br',
      subject: `📊 SDR-KRAFT — Resumo ${dataStr}`,
      body
    }),
    sendEmail({
      to: 'polyana.rezende@gmail.com',
      subject: `📊 SDR-KRAFT — Resumo ${dataStr}`,
      body
    })
  ])

  return NextResponse.json({ ok: true, date: dataStr })
}
