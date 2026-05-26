import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', ['email_template_d0_subject', 'email_template_d0_body'])

  const subject = data?.find(s => s.key === 'email_template_d0_subject')?.value
    || 'Dúvida sobre {{company_name}}'
  const body = data?.find(s => s.key === 'email_template_d0_body')?.value || ''

  return NextResponse.json({ subject, body })
}
