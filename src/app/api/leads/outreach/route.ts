import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('lead_ids');
  if (!ids) return NextResponse.json({});

  const leadIds = ids.split(',').map(s => s.trim()).filter(Boolean);
  if (!leadIds.length) return NextResponse.json({});

  const { data, error } = await supabase
    .from('outreach')
    .select('lead_id, sent_at, channel, message, touch_number, status')
    .in('lead_id', leadIds)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // DISTINCT ON (lead_id) em JS — mantém só o mais recente por lead
  const result: Record<string, unknown> = {};
  for (const row of data ?? []) {
    if (!result[row.lead_id]) result[row.lead_id] = row;
  }

  return NextResponse.json(result);
}
