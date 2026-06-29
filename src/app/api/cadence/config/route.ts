// ============================================================
// src/app/api/cadence/config/route.ts
// Config GERAL da cadência: ativo (liga/desliga) e limite_por_execucao.
// GET → lê · PUT → salva
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('cadence_config')
    .select('ativo, limite_por_execucao, updated_at')
    .eq('id', 1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

export async function PUT(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const patch: Record<string, any> = {};
  if (typeof b.ativo === 'boolean') patch.ativo = b.ativo;
  if (b.limite_por_execucao !== undefined) {
    const n = Number(b.limite_por_execucao);
    if (!Number.isInteger(n) || n < 1 || n > 500)
      return NextResponse.json({ error: 'limite_por_execucao deve ser entre 1 e 500' }, { status: 400 });
    patch.limite_por_execucao = n;
  }
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });

  const { data, error } = await supabase
    .from('cadence_config')
    .update(patch)
    .eq('id', 1)
    .select('ativo, limite_por_execucao, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config: data });
}
