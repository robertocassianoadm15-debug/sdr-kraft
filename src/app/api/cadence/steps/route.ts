// ============================================================
// src/app/api/cadence/steps/route.ts
// CRUD dos toques (follow-ups) da cadência — quantos você quiser.
// GET    → lista todos os toques (ordenados)
// POST   → adiciona um toque novo (no fim)
// PUT    → edita um toque (dias, modo, texto, ativo)
// DELETE → remove um toque e renumera os seguintes
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('cadence_steps')
    .select('*')
    .order('step_number', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ steps: data ?? [] });
}

export async function POST(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const { data: last } = await supabase
    .from('cadence_steps')
    .select('step_number')
    .order('step_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextNumber = (last?.step_number ?? 0) + 1;

  const modo = b.modo_texto === 'template' ? 'template' : 'ia';
  const dias = Number.isInteger(b.dias_apos) ? b.dias_apos : (nextNumber === 1 ? 0 : 10);
  if (dias < 0 || dias > 365)
    return NextResponse.json({ error: 'dias_apos deve ser entre 0 e 365' }, { status: 400 });
  if (modo === 'template' && !b.body?.trim())
    return NextResponse.json({ error: 'toque template precisa de texto (body)' }, { status: 400 });

  const { data, error } = await supabase
    .from('cadence_steps')
    .insert({
      step_number: nextNumber,
      dias_apos: dias,
      modo_texto: modo,
      subject: modo === 'template' ? (b.subject ?? '').trim() : null,
      body: modo === 'template' ? b.body.trim() : null,
      ativo: b.ativo !== false
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, step: data });
}

export async function PUT(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const patch: Record<string, any> = {};
  if (b.dias_apos !== undefined) {
    const d = Number(b.dias_apos);
    if (!Number.isInteger(d) || d < 0 || d > 365)
      return NextResponse.json({ error: 'dias_apos deve ser entre 0 e 365' }, { status: 400 });
    patch.dias_apos = d;
  }
  if (b.modo_texto !== undefined) {
    if (b.modo_texto !== 'ia' && b.modo_texto !== 'template')
      return NextResponse.json({ error: 'modo_texto inválido' }, { status: 400 });
    patch.modo_texto = b.modo_texto;
  }
  if (b.subject !== undefined) patch.subject = (b.subject ?? '').trim() || null;
  if (b.body !== undefined)    patch.body = (b.body ?? '').trim() || null;
  if (typeof b.ativo === 'boolean') patch.ativo = b.ativo;

  const { data, error } = await supabase
    .from('cadence_steps')
    .update(patch)
    .eq('id', b.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, step: data });
}

export async function DELETE(req: NextRequest) {
  let id: string;
  try { ({ id } = await req.json()); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const { data: alvo, error: alvoErr } = await supabase
    .from('cadence_steps').select('step_number').eq('id', id).single();
  if (alvoErr) return NextResponse.json({ error: alvoErr.message }, { status: 404 });

  const { error: delErr } = await supabase.from('cadence_steps').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data: seguintes } = await supabase
    .from('cadence_steps')
    .select('id, step_number')
    .gt('step_number', alvo.step_number)
    .order('step_number', { ascending: true });

  for (const s of seguintes ?? []) {
    await supabase.from('cadence_steps')
      .update({ step_number: s.step_number - 1 })
      .eq('id', s.id);
  }

  return NextResponse.json({ ok: true });
}
