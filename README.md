# SDR Kraft — SDR/BDR Autônomo para Sacos Kraft

Sistema de prospecção e qualificação automatizada com IA, focado em **gráficas que vendem sacos Kraft para delivery, presentes e entregas**.

## Stack (100% grátis no MVP)

| Camada | Serviço | Tier grátis |
|---|---|---|
| Frontend + Backend | Next.js 14 (App Router) | — |
| Banco | Supabase Postgres | 500 MB |
| LLM (SDR + BDR) | Groq (Llama 3.1 70B) | Generoso |
| Email | Resend | 3k/mês |
| WhatsApp | Evolution API (self-host) | Grátis (VPS opcional) |
| Scraping | Google Places API | $200/mês crédito |
| Deploy | Vercel | Grátis |
| Repo | GitHub | Grátis |

## Setup (15 min)

### 1. Clone e instale
```bash
git clone <seu-repo> sdr-kraft
cd sdr-kraft
npm install
```

### 2. Supabase
1. Crie projeto em https://supabase.com (grátis)
2. SQL Editor → cole `supabase/migrations/001_init.sql` → Run
3. Settings → API → copie `URL` e `service_role key`

### 3. Groq (LLM grátis)
1. https://console.groq.com → crie API key
2. Modelo padrão: `llama-3.1-70b-versatile`

### 4. Resend (Email)
1. https://resend.com → crie API key
2. Verifique seu domínio (ou use `onboarding@resend.dev` no MVP)

### 5. Google Places (opcional, para scraping)
1. Console Google Cloud → habilite "Places API (New)"
2. Crie API key restrita por IP

### 6. Variáveis de ambiente
Copie `.env.example` para `.env.local` e preencha:
```bash
cp .env.example .env.local
```

### 7. Rode local
```bash
npm run dev
```
Abra http://localhost:3000

### 8. Deploy Vercel
```bash
npm i -g vercel
vercel
```
Adicione as env vars no painel Vercel.

## Arquitetura

```
┌────────────────────────────────────────────────────┐
│  PAINÉIS (Next.js App Router)                      │
│  /import   → Upload CSV + scraping Google Maps     │
│  /prospect → Fila de leads + envio IA              │
│  /dashboard→ Métricas em tempo real                │
└────────────────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────────────────┐
│  API ROUTES (serverless)                           │
│  /api/leads/import      → parse CSV                │
│  /api/leads/scrape      → Google Places            │
│  /api/outreach/send     → gera msg IA + envia      │
│  /api/conversations/    → webhook BDR autônomo     │
│      webhook                                       │
│  /api/dashboard/metrics → KPIs                     │
└────────────────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────────────────┐
│  DADOS (Supabase Postgres)                         │
│  leads → outreach → conversations → qualifications │
│  event_log (auditoria de TUDO)                     │
└────────────────────────────────────────────────────┘
```

## Rastreabilidade

Toda ação relevante grava em `event_log` com:
- `entity_type` (lead, outreach, conversation)
- `entity_id`
- `action` (created, sent, replied, qualified, …)
- `metadata` (jsonb com contexto completo)
- `created_at`

Query exemplo:
```sql
SELECT * FROM event_log WHERE entity_id = 'lead-uuid' ORDER BY created_at;
```

## Roadmap (arranjo para avanços futuros)

- [ ] Multi-tenant (RLS já preparado)
- [ ] Z-API/Evolution API (WhatsApp real)
- [ ] A/B testing de prompts
- [ ] Lead scoring com ML
- [ ] Integração CRM (Pipedrive, HubSpot)
- [ ] Substituir Groq por Claude/GPT (trocar 1 arquivo)
- [ ] 
