import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(`
      id,
      lead_id,
      direction,
      content,
      ai_generated,
      auto_replied,
      awaiting_human,
      read_by_human,
      intent,
      confidence,
      created_at,
      leads!inner (
        id,
        company_name,
        email,
        segment,
        whatsapp,
        phone,
        human_takeover
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grouped: Record<string, any> = {}
  for (const conv of conversations || []) {
    const leadId = conv.lead_id
    if (!grouped[leadId]) {
      grouped[leadId] = {
        lead: conv.leads,
        messages: [],
        last_activity: conv.created_at,
      }
    }
    grouped[leadId].messages.push({
      id: conv.id,
      direction: conv.direction,
      content: conv.content,
      ai_generated: conv.ai_generated,
      auto_replied: conv.auto_replied,
      awaiting_human: conv.awaiting_human,
      read_by_human: conv.read_by_human,
      intent: conv.intent,
      confidence: conv.confidence,
      created_at: conv.created_at,
    })
  }

  for (const leadId of Object.keys(grouped)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    grouped[leadId].messages.sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = Object.values(grouped).sort((a: any, b: any) =>
    new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
  )

  return NextResponse.json({ conversations: result })
}
