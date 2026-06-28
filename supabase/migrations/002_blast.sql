-- ============================================================
-- 002_blast.sql — Disparo em Lote Manual (Blast)
-- Feature ISOLADA da cadência automática (outreach/process-cadence).
-- Você monta um lote por campanha, revisa o preview, e dispara.
-- ============================================================

-- ── Tabela do lote (o "disparo" que você monta) ─────────────
create table if not exists public.blast_batches (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid references public.campaigns(id) on delete set null,
  channel      text not null check (channel in ('email','whatsapp')),
  subject      text,
  body         text not null,
  image_urls   jsonb not null default '[]'::jsonb,
  target_count integer not null default 0,
  status       text not null default 'draft'
               check (status in ('draft','confirmed','sending','sent','cancelled')),
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  sent_at      timestamptz
);

-- ── Alvos do lote (os N leads escolhidos + status individual) ─
create table if not exists public.blast_targets (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.blast_batches(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  to_email    text,
  to_whatsapp text,
  status      text not null default 'pending'
              check (status in ('pending','sent','failed','skipped')),
  error       text,
  provider_id text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (batch_id, lead_id)
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists idx_blast_batches_status   on public.blast_batches(status);
create index if not exists idx_blast_batches_campaign on public.blast_batches(campaign_id);
create index if not exists idx_blast_targets_batch    on public.blast_targets(batch_id);
create index if not exists idx_blast_targets_status   on public.blast_targets(batch_id, status);

-- ── Trigger updated_at ───────────────────────────────────────
create or replace function public.touch_blast_batches()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch_blast_batches on public.blast_batches;
create trigger trg_touch_blast_batches
  before update on public.blast_batches
  for each row execute function public.touch_blast_batches();

-- ── RLS ATIVO ────────────────────────────────────────────────
alter table public.blast_batches enable row level security;
alter table public.blast_targets enable row level security;
