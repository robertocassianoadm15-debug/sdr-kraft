import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/logger';
import { llmJSON } from '@/lib/llm';
import { extractText, detectFormat } from '@/lib/extractor';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LeadSchema = z.object({
  company_name: z.string().min(1),
  contact_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')).or(z.literal(null)),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  website: z.string().optional().nullable()
});
type LeadInput = z.infer<typeof LeadSchema>;

function parseCSVText(text: string): any[] {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) =>
      h.trim().toLowerCase()
        .replace(/\s+/g, '_')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  });
  return (parsed.data as any[]).filter(r => r.company_name || r.nome || r.empresa);
}

function normalizeCSVRow(row: any): LeadInput {
  const get = (...keys: string[]) => {
    for (const k of keys) if (row[k]) return String(row[k]).trim();
    return null;
  };
  return {
    company_name: get('company_name','empresa','nome','razao_social','nome_empresa','company') ?? '',
    contact_name: get('contact_name','contato','nome_contato','responsavel','contact'),
    email:        get('email','e_mail','e-mail','mail'),
    phone:        get('phone','telefone','fone','tel'),
    whatsapp:     get('whatsapp','zap','wpp','whats'),
    segment:      get('segment','segmento','ramo','nicho','categoria'),
    city:         get('city','cidade','municipio'),
    state:        get('state','estado','uf'),
    website:      get('website','site','url','homepage')
  };
}

async function extractLeadsWithAI(text: string, filename: string): Promise<LeadInput[]> {
  const truncated = text.slice(0, 6000);
  const result = await llmJSON<{ leads: any[] }>([
    {
      role: 'system',
      content: `Você é um extrator de dados. Leia o texto e extraia TODOS os negócios/empresas encontrados.
Retorne JSON: {"leads":[{"company_name":"...","contact_name":"...","email":"...","phone":"...","segment":"...","city":"...","state":"...","website":"..."}]}
- company_name é obrigatório. Demais campos: null se não encontrar.
- segment: restaurante, hamburgueria, pizzaria, dark_kitchen, confeitaria, padaria, floricultura, loja_de_presente, ecommerce, cafeteria, sorveteria, cestas, ou descrição do negócio.
- Retorne APENAS o JSON.`
    },
    { role: 'user', content: `Arquivo: ${filename}\n\n${truncated}` }
  ], { temperature: 0.2, max_tokens: 2000 });
  return result.leads ?? [];
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const campaignId = form.get('campaign_id') as string | null;

    if (!file) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 });

    const filename = file.name;
    const fmt = detectFormat(filename);
    const buffer = Buffer.from(await file.arrayBuffer());

    let rawLeads: LeadInput[] = [];

    if (fmt === 'csv') {
      rawLeads = parseCSVText(buffer.toString('utf-8')).map(normalizeCSVRow);
    } else if (fmt === 'xlsx' || fmt === 'xls') {
      const text = await extractText(buffer, filename);
      rawLeads = parseCSVText(text).map(normalizeCSVRow);
    } else {
      const text = await extractText(buffer, filename);
      if (!text.trim()) return NextResponse.json({ error: 'arquivo sem conteúdo legível' }, { status: 400 });
      rawLeads = await extractLeadsWithAI(text, filename);
    }

    const valid: any[] = [];
    const invalid: any[] = [];

    for (const row of rawLeads) {
      const r = LeadSchema.safeParse(row);
      if (r.success && r.data.company_name) {
        valid.push({
          company_name: r.data.company_name,
          contact_name: r.data.contact_name || null,
          email:        r.data.email || null,
          phone:        r.data.phone || null,
          whatsapp:     r.data.whatsapp || r.data.phone || null,
          segment:      r.data.segment || null,
          city:         r.data.city || null,
          state:        r.data.state || null,
          website:      r.data.website || null,
          campaign_id:  campaignId || null,
          source: fmt === 'csv' ? 'csv' : ['xlsx','xls'].includes(fmt) ? 'excel' : 'ai_extracted',
          raw: row
        });
      } else {
        invalid.push(row);
      }
    }

    let inserted = 0;
    if (valid.length) {
      const { data, error } = await supabase.from('leads').insert(valid).select('id, email');
      if (error) throw error;
      inserted = data?.length ?? 0;

      // Cria cadência D0/D3/D7 para leads com email
      const leadsWithEmail = (data ?? []).filter(l => l.email);
      if (leadsWithEmail.length) {
        const now = new Date();
        const d3  = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const d7  = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const cadence = leadsWithEmail.flatMap(l => [
          { lead_id: l.id, channel: 'email', direction: 'outbound', status: 'pending',   touch_number: 1, scheduled_at: now.toISOString() },
          { lead_id: l.id, channel: 'email', direction: 'outbound', status: 'scheduled', touch_number: 2, scheduled_at: d3.toISOString()  },
          { lead_id: l.id, channel: 'email', direction: 'outbound', status: 'scheduled', touch_number: 3, scheduled_at: d7.toISOString()  },
        ]);
        await supabase.from('outreach').insert(cadence);
      }
    }

    // Atualiza nome/formato do arquivo na campanha
    if (campaignId && inserted > 0) {
      await supabase.from('campaigns')
        .update({ source_file: filename, format: fmt })
        .eq('id', campaignId);
    }

    await logEvent({
      entity_type: 'system', action: 'file_import',
      metadata: { filename, format: fmt, extracted: rawLeads.length, inserted, campaign_id: campaignId }
    });

    return NextResponse.json({
      ok: true, format: fmt,
      method: ['csv','xlsx','xls'].includes(fmt) ? 'parse direto' : 'extração por IA',
      extracted: rawLeads.length, inserted, invalid_count: invalid.length,
      campaign_id: campaignId
    });
  } catch (err: any) {
    console.error('[import]', err);
    return NextResponse.json({ error: err.message ?? 'erro interno' }, { status: 500 });
  }
}
