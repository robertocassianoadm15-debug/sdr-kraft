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

    const todayStartBR = new Date();
    todayStartBR.setUTCHours(3, 0, 0, 0); // 00:00 Brasília = 03:00 UTC
    if (todayStartBR > new Date()) todayStartBR.setUTCDate(todayStartBR.getUTCDate() - 1);
    const todayISO = todayStartBR.toISOString();

    // Enviados hoje = cadência (outreach) + disparo em lote (blast_targets)
    const [{ count: cadenceToday }, { count: blastToday }] = await Promise.all([
      supabase.from('outreach')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', todayISO),
      supabase.from('blast_targets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', todayISO)
    ]);
    const sentToday = (cadenceToday ?? 0) + (blastToday ?? 0);

    return NextResponse.json({
      metrics,
      sent_today: sentToday ?? 0,
      recent_events: recentEvents ?? [],
      hot_leads: hotLeads ?? []
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
