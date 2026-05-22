import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/logger';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — lista todas as campanhas
export async function GET() {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

// POST — cria campanha
const CreateBody = z.object({
  name: z.string().min(1),
  description: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const body = CreateBody.parse(await req.json());
    const { data, error } = await supabase
      .from('campaigns')
      .insert({ name: body.name, description: body.description ?? null })
      .select()
      .single();

    if (error) throw error;

    await logEvent({
      entity_type: 'system',
      action: 'campaign_created',
      metadata: { name: body.name, id: data.id }
    });

    return NextResponse.json({ campaign: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove campanha e desvincula leads
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    await supabase.from('leads').update({ campaign_id: null }).eq('campaign_id', id);
    await supabase.from('campaigns').delete().eq('id', id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — atualiza status da campanha
export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    if (!id || !status) return NextResponse.json({ error: 'id e status obrigatórios' }, { status: 400 });

    const { data, error } = await supabase
      .from('campaigns')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ campaign: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
