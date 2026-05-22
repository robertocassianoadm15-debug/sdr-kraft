import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchPlaces } from '@/lib/places';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 30;

const Body = z.object({
  query: z.string().min(3),
  segment: z.string().optional(),
  max_results: z.number().min(1).max(20).default(20)
});

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());

    const places = await searchPlaces(body.query, body.max_results);

    // upsert por google_place_id pra não duplicar
    const rows = places.map(p => ({
      company_name: p.company_name,
      phone: p.phone,
      whatsapp: p.phone,
      website: p.website,
      city: p.city,
      state: p.state,
      segment: body.segment ?? null,
      google_place_id: p.google_place_id,
      source: 'google_places',
      raw: p.raw
    }));

    let inserted = 0;
    if (rows.length) {
      const { data, error } = await supabase
        .from('leads')
        .upsert(rows, { onConflict: 'google_place_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      inserted = data?.length ?? 0;
    }

    await logEvent({
      entity_type: 'system',
      action: 'places_scrape',
      metadata: { query: body.query, found: places.length, inserted }
    });

    return NextResponse.json({
      found: places.length,
      inserted,
      skipped: places.length - inserted
    });
  } catch (err: any) {
    console.error('[scrape] erro:', err);
    return NextResponse.json({ error: err.message ?? 'erro interno' }, { status: 500 });
  }
}
