-- ============================================================
-- 003_blast_templates.sql — Modelos reutilizáveis de disparo
-- Salvar, editar, excluir e reusar um email/mensagem montada.
-- ============================================================

create table if not exists public.blast_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  channel     text not null check (channel in ('email','whatsapp')),
  subject     text,
  body        text not null,
  image_urls  jsonb not null default '[]'::jsonb,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_blast_templates_name on public.blast_templates(name);
create index if not exists idx_blast_templates_channel on public.blast_templates(channel);

create or replace function public.touch_blast_templates()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch_blast_templates on public.blast_templates;
create trigger trg_touch_blast_templates
  before update on public.blast_templates
  for each row execute function public.touch_blast_templates();

alter table public.blast_templates enable row level security;
