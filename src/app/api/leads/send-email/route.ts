import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { lead_id, subject, body, image_url } = await req.json()
  if (!lead_id || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'lead_id, subject e body obrigatórios' }, { status: 400 })
  }

  const { data: lead } = await supabase
    .from('leads').select('id, company_name, email').eq('id', lead_id).single()

  if (!lead?.email) return NextResponse.json({ error: 'Lead sem email' }, { status: 400 })

  if (image_url) {
    const { sendHtmlEmail } = await import('@/lib/send-html-email')
    const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const htmlContent = `<div style="font-family:sans-serif;max-width:600px"><p style="white-space:pre-wrap;margin:0 0 16px 0">${safe(body).replace(/\n/g, '<br>')}</p><img src="${image_url}" style="max-width:100%;border-radius:8px" alt=""></div>`
    await sendHtmlEmail({ to: lead.email, subject, htmlContent })
  } else {
    await sendEmail({ to: lead.email, subject, body })
  }

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
