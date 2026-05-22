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
  return NextResponse.json({ leads: data ?? [] });
}
