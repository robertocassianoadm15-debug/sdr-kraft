import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyPassword, hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha obrigatórios' }, { status: 400 });
    }

    const { data: user } = await supabase
      .from('app_users')
      .select('id, name, password_hash')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (!user) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    // Migra senha em texto puro para bcrypt de forma transparente
    if (!user.password_hash.startsWith('$2')) {
      const hashed = await hashPassword(password);
      await supabase.from('app_users').update({ password_hash: hashed }).eq('id', user.id);
    }

    const res = NextResponse.json({ ok: true, name: user.name });
    res.cookies.set('sdr_auth', user.id, {
      httpOnly: true,
      maxAge: 28800,
      path: '/',
      sameSite: 'lax'
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'erro interno' }, { status: 500 });
  }
}
