import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { lead_id, takeover } = await req.json()
  if (!lead_id || typeof takeover !== 'boolean') {
    return NextResponse.json({ error: 'lead_id e takeover obrigatórios' }, { status: 400 })
  }
  const { error } = await supabase
    .from('leads')
    .update({ human_takeover: takeover })
    .eq('id', lead_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, lead_id, human_takeover: takeover })
}
