// ============================================================
// src/app/api/blast/create/route.ts
// Cria um lote (status=draft) a partir de uma campanha.
// Monta os alvos (snapshot email/whatsapp) conforme o canal.
// NÃO envia nada — só prepara para o preview.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateBody {
  campaign_id: string;
  channel: 'email' | 'whatsapp';
  subject?: string;
  body: string;
  image_urls?: string[];
  limit?: number;
  created_by?: string;
}

export async function POST(req: NextRequest) {
  let payload: CreateBody;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { campaign_id, channel, subject, body, image_urls = [], limit } = payload;

  if (!campaign_id)                      return NextResponse.json({ error: 'campaign_id obrigatório' }, { status: 400 });
  if (channel !== 'email' && channel !== 'whatsapp')
                                         return NextResponse.json({ error: 'channel inválido' }, { status: 400 });
  if (!body || !body.trim())             return NextResponse.json({ error: 'body (texto) obrigatório' }, { status: 400 });
  if (channel === 'email' && !subject?.trim())
                                         return NextResponse.json({ error: 'subject obrigatório para email' }, { status: 400 });
  if (image_urls.length > 3)             return NextResponse.json({ error: 'máximo 3 imagens' }, { status: 400 });
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
                                         return NextResponse.json({ error: 'limit inválido' }, { status: 400 });

  const channelCol = channel === 'email' ? 'email' : 'whatsapp';
  let query = supabase
    .from('leads')
    .select('id, company_name, contact_name, email, whatsapp')
    .eq('campaign_id', campaign_id)
    .not(channelCol, 'is', null)
    .neq(channelCol, '')
    .order('created_at', { ascending: true });

  if (limit) query = query.limit(limit);

  const { data: leads, error: leadsErr } = await query;
  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });
  if (!leads || leads.length === 0)
    return NextResponse.json({ error: 'Nenhum lead com este canal nesta campanha' }, { status: 404 });

  const { data: batch, error: batchErr } = await supabase
    .from('blast_batches')
    .insert({
      campaign_id,
      channel,
      subject: channel === 'email' ? subject!.trim() : null,
      body: body.trim(),
      image_urls,
      target_count: leads.length,
      status: 'draft',
      created_by: payload.created_by ?? 'operador'
    })
    .select()
    .single();

  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 });

  const targets = leads.map(l => ({
    batch_id: batch.id,
    lead_id: l.id,
    to_email: channel === 'email' ? l.email : null,
    to_whatsapp: channel === 'whatsapp' ? l.whatsapp : null,
    status: 'pending' as const
  }));

  const { error: targetsErr } = await supabase.from('blast_targets').insert(targets);
  if (targetsErr) {
    await supabase.from('blast_batches').delete().eq('id', batch.id);
    return NextResponse.json({ error: targetsErr.message }, { status: 500 });
  }

  await supabase.from('event_log').insert({
    entity_type: 'blast', action: 'blast_created', actor: payload.created_by ?? 'operador',
    metadata: { batch_id: batch.id, channel, count: leads.length, campaign_id }
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok: true,
    batch_id: batch.id,
    channel,
    target_count: leads.length,
    preview: {
      subject: batch.subject,
      body: batch.body,
      image_urls: batch.image_urls,
      sample_recipients: leads.slice(0, 5).map(l => ({
        company: l.company_name,
        to: channel === 'email' ? l.email : l.whatsapp
      }))
    }
  });
}
