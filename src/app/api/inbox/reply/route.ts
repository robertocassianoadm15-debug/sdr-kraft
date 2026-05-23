import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/providers';
import { logEvent } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { conversation_id, reply_text } = await req.json();
  if (!conversation_id || !reply_text) {
    return NextResponse.json({ error: 'conversation_id e reply_text obrigatórios' }, { status: 400 });
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('*, leads(email, company_name, contact_name)')
    .eq('id', conversation_id)
    .single();
  if (!conv) return NextResponse.json({ error: 'conversa não encontrada' }, { status: 404 });

  const lead = (conv as any).leads;
  if (!lead?.email) return NextResponse.json({ error: 'lead sem email' }, { status: 400 });

  const originalSubject = (conv.metadata as Record<string, string>)?.subject ?? 'Seu contato';

  await sendEmail({
    to: lead.email,
    subject: `Re: ${originalSubject}`,
    body: reply_text
  });

  await supabase.from('conversations').insert({
    lead_id: conv.lead_id,
    channel: 'email',
    direction: 'outbound',
    content: reply_text,
    ai_generated: false,
    metadata: { in_reply_to: conversation_id, sent_by: 'human' }
  });

  await supabase.from('conversations')
    .update({ awaiting_human: false, read_by_human: true })
    .eq('id', conversation_id);

  await logEvent({
    entity_type: 'conversation',
    entity_id: conversation_id,
    action: 'human_replied',
    metadata: { reply_length: reply_text.length }
  });

  return NextResponse.json({ ok: true });
}
