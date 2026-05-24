import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data: current } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'ia_system_prompt')
    .single()

  const { data: history } = await supabase
    .from('ia_prompt_history')
    .select('id, prompt_text, edited_by, note, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    current_prompt: current?.value || '',
    history: history || []
  })
}

export async function POST(req: NextRequest) {
  const { prompt_text, edited_by, note } = await req.json()

  if (!prompt_text || prompt_text.trim().length < 10) {
    return NextResponse.json({ error: 'Prompt muito curto' }, { status: 400 })
  }

  await supabase.from('ia_prompt_history').insert({
    prompt_text: prompt_text.trim(),
    edited_by: edited_by || 'Polyana',
    note: note || null
  })

  await supabase.from('settings')
    .update({ value: prompt_text.trim() })
    .eq('key', 'ia_system_prompt')

  await supabase.from('settings')
    .update({ value: new Date().toISOString() })
    .eq('key', 'ia_prompt_updated_at')

  await supabase.from('settings')
    .update({ value: edited_by || 'Polyana' })
    .eq('key', 'ia_prompt_updated_by')

  return NextResponse.json({ ok: true })
}
