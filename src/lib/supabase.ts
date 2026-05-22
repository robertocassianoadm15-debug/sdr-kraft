import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.warn('[supabase] env vars ausentes — funções de DB falharão.');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

export type LeadStatus =
  | 'new' | 'queued' | 'contacted' | 'replied'
  | 'qualified' | 'disqualified' | 'lost';

export interface Lead {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  google_place_id: string | null;
  source: string;
  status: LeadStatus;
  score: number;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
