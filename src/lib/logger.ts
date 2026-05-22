import { supabase } from './supabase';

type EntityType = 'lead' | 'outreach' | 'conversation' | 'qualification' | 'system';

export async function logEvent(params: {
  entity_type: EntityType;
  entity_id?: string;
  action: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.from('event_log').insert({
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      action: params.action,
      actor: params.actor ?? 'system',
      metadata: params.metadata ?? {}
    });
  } catch (err) {
    console.error('[event_log] falha ao gravar:', err);
  }
}
