import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status      = url.searchParams.get('status') ?? undefined;
  const campaignId  = url.searchParams.get('campaign_id') ?? undefined;
  const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10), 500);

  let q = supabase
    .from('leads')
    .select('id, company_name, contact_name, email, whatsapp, phone, segment, city, state, status, score, campaign_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);

  // campaign_id=all → sem filtro; campaign_id=<uuid> → filtra pela campanha
  if (campaignId && campaignId !== 'all') {
    q = q.eq('campaign_id', campaignId);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data && data.length > 0) {
    const leadIds = data.map(l => l.id);
    const { data: lastSentData } = await supabase
      .from('outreach')
      .select('lead_id, sent_at')
      .in('lead_id', leadIds)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false });

    const lastSentMap: Record<string, string> = {};
    (lastSentData ?? []).forEach(o => {
      if (!lastSentMap[o.lead_id]) {
        lastSentMap[o.lead_id] = o.sent_at;
      }
    });

    const enriched = data.map(l => ({
      ...l,
      last_sent_at: lastSentMap[l.id] ?? null
    }));

    return NextResponse.json({ leads: enriched });
  }

  return NextResponse.json({ leads: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json() as { ids: string[] };
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids obrigatório' }, { status: 400 });
    }
    // Deleta dependentes com FK antes dos leads
    await supabase.from('conversations').delete().in('lead_id', ids);
    await supabase.from('outreach').delete().in('lead_id', ids);
    // Deleta os leads
    const { count } = await supabase
      .from('leads')
      .delete({ count: 'exact' })
      .in('id', ids)
      .eq('status', 'new'); // segurança: só apaga leads new
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
