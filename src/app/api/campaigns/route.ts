import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/logger';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET — lista todas as campanhas COM contagem por canal
export async function GET() {
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = await Promise.all(
    (campaigns ?? []).map(async (c) => {
      const [{ count: withEmail }, { count: withWhatsapp }] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id).not('email', 'is', null).neq('email', ''),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id).not('whatsapp', 'is', null).neq('whatsapp', '')
      ]);
      return { ...c, leads_email: withEmail ?? 0, leads_whatsapp: withWhatsapp ?? 0 };
    })
  );

  return NextResponse.json({ campaigns: enriched });
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
