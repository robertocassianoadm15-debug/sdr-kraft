// ============================================================
// src/app/api/blast/templates/route.ts
// CRUD de modelos reutilizáveis de disparo.
// GET    → lista todos
// POST   → cria novo
// PUT    → edita existente (salvar por cima)
// DELETE → exclui
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabase
    .from('blast_templates')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  if (!b.name?.trim())                      return NextResponse.json({ error: 'nome obrigatório' }, { status: 400 });
  if (b.channel !== 'email' && b.channel !== 'whatsapp')
                                            return NextResponse.json({ error: 'channel inválido' }, { status: 400 });
  if (!b.body?.trim())                      return NextResponse.json({ error: 'texto obrigatório' }, { status: 400 });
  if (Array.isArray(b.image_urls) && b.image_urls.length > 3)
                                            return NextResponse.json({ error: 'máximo 3 imagens' }, { status: 400 });

  const { data, error } = await supabase
    .from('blast_templates')
    .insert({
      name: b.name.trim(),
      channel: b.channel,
      subject: b.channel === 'email' ? (b.subject ?? '').trim() : null,
      body: b.body.trim(),
      image_urls: b.image_urls ?? [],
      created_by: b.created_by ?? 'operador'
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}

export async function PUT(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  if (!b.id)                                return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  if (!b.name?.trim())                      return NextResponse.json({ error: 'nome obrigatório' }, { status: 400 });
  if (!b.body?.trim())                      return NextResponse.json({ error: 'texto obrigatório' }, { status: 400 });
  if (Array.isArray(b.image_urls) && b.image_urls.length > 3)
                                            return NextResponse.json({ error: 'máximo 3 imagens' }, { status: 400 });

  const { data, error } = await supabase
    .from('blast_templates')
    .update({
      name: b.name.trim(),
      channel: b.channel,
      subject: b.channel === 'email' ? (b.subject ?? '').trim() : null,
      body: b.body.trim(),
      image_urls: b.image_urls ?? []
    })
    .eq('id', b.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, template: data });
}

export async function DELETE(req: NextRequest) {
  let id: string;
  try { ({ id } = await req.json()); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const { error } = await supabase.from('blast_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
