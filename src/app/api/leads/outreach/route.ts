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
    .select('lead_id, sent_at, created_at, channel, message, touch_number')
    .in('lead_id', leadIds)
    .eq('status', 'sent')
    .order('lead_id',    { ascending: true })
    .order('sent_at',    { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Para cada lead, guarda o mais recente por canal (email e whatsapp separados)
  const result: Record<string, {
    lead_id: string;
    email_sent_at?: string;
    email_touch?: number;
    whatsapp_sent_at?: string;
    whatsapp_touch?: number;
  }> = {};

  for (const row of data ?? []) {
    if (!result[row.lead_id]) result[row.lead_id] = { lead_id: row.lead_id };
    const entry = result[row.lead_id];
    if (row.channel === 'email' && !entry.email_sent_at) {
      entry.email_sent_at = row.sent_at ?? row.created_at;
      entry.email_touch   = row.touch_number;
    }
    if (row.channel === 'whatsapp' && !entry.whatsapp_sent_at) {
      entry.whatsapp_sent_at = row.sent_at ?? row.created_at;
      entry.whatsapp_touch   = row.touch_number;
    }
  }

  return NextResponse.json(result);
}
