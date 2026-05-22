import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data: metrics, error: mErr } = await supabase
      .from('dashboard_metrics').select('*').single();
    if (mErr) throw mErr;

    const { data: recentEvents } = await supabase
      .from('event_log')
      .select('id, entity_type, entity_id, action, actor, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(15);

    const { data: hotLeads } = await supabase
      .from('leads')
      .select('id, company_name, segment, city, status, score, updated_at')
      .order('score', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      metrics,
      recent_events: recentEvents ?? [],
      hot_leads: hotLeads ?? []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
