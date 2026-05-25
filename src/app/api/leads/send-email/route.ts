import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { lead_id, subject, body } = await req.json()
  if (!lead_id || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'lead_id, subject e body obrigatórios' }, { status: 400 })
  }

  const { data: lead } = await supabase
    .from('leads').select('id, company_name, email').eq('id', lead_id).single()

  if (!lead?.email) return NextResponse.json({ error: 'Lead sem email' }, { status: 400 })

  await sendEmail({ to: lead.email, subject, body })

  await supabase.from('conversations').insert({
    lead_id,
    channel: 'email',
    direction: 'outbound',
    content: body,
    ai_generated: false,
    metadata: { subject, sent_from: 'historico_manual' }
  })

  return NextResponse.json({ ok: true })
}
