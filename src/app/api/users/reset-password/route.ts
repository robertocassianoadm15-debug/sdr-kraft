import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { id, new_password } = await req.json()
  if (!id || !new_password || new_password.length < 6) {
    return NextResponse.json({ error: 'id e senha (mín. 6 chars) obrigatórios' }, { status: 400 })
  }
  const hashed = await hashPassword(new_password)
  const { error } = await supabase.from('app_users').update({ password_hash: hashed }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
