import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';
import { verifyToken } from '@/lib/jwt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = (await cookies()).get('sdr_auth')?.value
  const userId = raw ? await verifyToken(raw) : null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('app_users')
    .select('id, name, email, created_at')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [], current_user_id: userId });
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nome, email e senha são obrigatórios' }, { status: 400 });
    }
    const { error } = await supabase.from('app_users').insert({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash: await hashPassword(password)
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'erro interno' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { id, name, email } = await req.json();
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {};
  if (name?.trim()) updates.name = name.trim();
  if (email?.trim()) updates.email = email.trim().toLowerCase();

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
  }

  const { error } = await supabase.from('app_users').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const { error } = await supabase.from('app_users').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
