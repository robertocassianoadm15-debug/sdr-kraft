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
  // detecta separador automaticamente (v\u00edrgula ou ponto-e-v\u00edrgula)
  const separator = text.split('\n')[0].includes(';') ? ';' : ',';
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: separator,
    transformHeader: (h: string) =>
      h.trim().toLowerCase()
        .replace(/\s+/g, '_')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  });
  return (parsed.data as any[]).filter(r => Object.values(r).some(v => v));
}

const COMPANY_KEYS = [
  'company_name','empresa','nome','razao_social','nome_empresa','company',
  'nome_da_empresa','nome_fantasia','fantasia',
  'razao_social_/_nome_fantasia',
  'razaosocial','nomefantasia'
];

function looksLikeCNPJ(value: string): boolean {
  return /^[\d.\-\/]+$/.test(value.trim());
}

const INVALID_PHONE_VALUES = new Set([
  'não informado','nao informado','n/a','na','-','sem telefone','sem numero','sem número',''
]);

function normalizeCSVRow(row: any): LeadInput {
  const get = (...keys: string[]) => {
    for (const k of keys) if (row[k]) return String(row[k]).trim();
    return null;
  };

  const hasKnownColumns = COMPANY_KEYS.some(k => row[k] !== undefined);

  if (!hasKnownColumns) {
    const vals = Object.values(row).map(v => (v ? String(v).trim() : null));
    return {
      company_name: vals[0] ?? '',
      contact_name: vals[1] ?? null,
      email:        vals[2] ?? null,
      phone:        vals[3] ?? null,
      whatsapp:     vals[3] ?? null,
      segment:      vals[4] ?? null,
      city:         vals[5] ?? null,
      state:        vals[6] ?? null,
      website:      null
    };
  }

  const result: LeadInput = {
    company_name: get(...COMPANY_KEYS) ?? '',
    contact_name: get('contact_name','contato','nome_contato','responsavel','contact',
      'nome_do_contato','proprietario','dono','socios'),
    email:        get('email','e_mail','e-mail','mail','correio',
      'e-mail_de_contato','email_de_contato'),
    phone:        get('telefone_comercial','phone','telefone','fone','tel','cel','celular','numero',
      'telefone_1','telefone_2','telefone1','telefone2',
      'telefone_whatsapp','telefone_/_whatsapp'),
    whatsapp:     get('whatsapp','zap','wpp','whats',
      'telefone_whatsapp','telefone_/_whatsapp'),
    segment:      get('cnaeprincipal','cnae_principal',
      'segment','segmento','ramo','nicho','categoria','atividade','tipo','area',
      'segmento_nicho','segmento_/_nicho','categoria_/_segmento'),
    city:         get('city','cidade','municipio','bairro','regiao','localidade'),
    state:        get('state','estado','uf'),
    website:      get('website','site','url','homepage')
  };

  // company_name: se parece CNPJ, buscar nome real
  if (result.company_name && looksLikeCNPJ(result.company_name)) {
    const realName = get('nomefantasia','nome_fantasia','razaosocial','razao_social');
    if (realName) result.company_name = realName;
  }

  // segment: limpar prefixo de código CNAE "5611201 - Restaurantes e similares" → "Restaurantes e similares"
  if (result.segment?.includes(' - ')) {
    result.segment = result.segment.split(' - ').slice(1).join(' - ');
  }

  // email: null se não contiver '@' e '.'
  if (result.email && (!result.email.includes('@') || !result.email.includes('.'))) {
    result.email = null;
  }

  // phone: null se valor for "Não informado" ou similar
  if (result.phone && INVALID_PHONE_VALUES.has(result.phone.toLowerCase().trim())) {
    result.phone = null;
  }

  return result;
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
      console.log('[import:xlsx] primeiras 3 linhas:', text.split('\n').slice(0, 3));
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
        const d10 = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
        const d20 = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000);
        const cadence = leadsWithEmail.flatMap(l => [
          { lead_id: l.id, channel: 'email', direction: 'outbound', status: 'pending',   touch_number: 1, scheduled_at: now.toISOString() },
          { lead_id: l.id, channel: 'email', direction: 'outbound', status: 'scheduled', touch_number: 2, scheduled_at: d10.toISOString() },
          { lead_id: l.id, channel: 'email', direction: 'outbound', status: 'scheduled', touch_number: 3, scheduled_at: d20.toISOString() },
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
