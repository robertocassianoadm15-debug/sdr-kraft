-- ============================================================
-- SDR Kraft — Migration 001 (inicial)
-- Postgres / Supabase
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- LEADS
-- ============================================================
create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  company_name    text not null,
  contact_name    text,
  email           text,
  phone           text,
  whatsapp        text,
  segment         text,             -- restaurante, dark_kitchen, presente, floricultura, ecommerce, confeitaria, outro
  city            text,
  state           text,
  website         text,
  google_place_id text unique,
  source          text not null,    -- csv, google_places, manual
  raw             jsonb default '{}'::jsonb,
  status          text not null default 'new', -- new, queued, contacted, replied, qualified, disqualified, lost
  score           int  default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_leads_status   on leads(status);
create index if not exists idx_leads_segment  on leads(segment);
create index if not exists idx_leads_created  on leads(created_at desc);

-- ============================================================
-- OUTREACH (tentativas de contato)
-- ============================================================
create table if not exists outreach (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id) on delete cascade,
  channel      text not null,            -- email, whatsapp
  direction    text not null default 'outbound',
  subject      text,
  message      text not null,
  status       text not null default 'pending', -- pending, sent, delivered, opened, replied, failed
  provider     text,                     -- resend, evolution
  provider_id  text,
  error        text,
  sent_at      timestamptz,
  created_at   timestamptz default now()
);

create index if not exists idx_outreach_lead    on outreach(lead_id);
create index if not exists idx_outreach_status  on outreach(status);
create index if not exists idx_outreach_channel on outreach(channel);

-- ============================================================
-- CONVERSATIONS (mensagens trocadas após primeiro contato)
-- ============================================================
create table if not exists conversations (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  outreach_id uuid references outreach(id) on delete set null,
  channel     text not null,
  direction   text not null,             -- inbound, outbound
  content     text not null,
  ai_generated boolean default false,
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

create index if not exists idx_conv_lead   on conversations(lead_id);
create index if not exists idx_conv_dir    on conversations(direction);
create index if not exists idx_conv_time   on conversations(created_at desc);

-- ============================================================
-- QUALIFICATIONS (BANT simplificado + intenção)
-- ============================================================
create table if not exists qualifications (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id) on delete cascade,
  has_budget      boolean,
  has_authority   boolean,
  has_need        boolean,
  has_timing      boolean,
  monthly_volume  int,                  -- sacos/mês estimado
  bag_type        text,                 -- delivery, presente, entrega, misto
  intent_score    int default 0,        -- 0-100
  notes           text,
  qualified       boolean default false,
  created_at      timestamptz default now()
);

create index if not exists idx_qual_lead  on qualifications(lead_id);
create index if not exists idx_qual_qualified on qualifications(qualified);

-- ============================================================
-- EVENT LOG (rastreabilidade total — auditoria)
-- ============================================================
create table if not exists event_log (
  id          bigserial primary key,
  entity_type text not null,        -- lead, outreach, conversation, qualification
  entity_id   uuid,
  action      text not null,        -- created, updated, sent, replied, qualified, error...
  actor       text default 'system',-- system, ai, user:<id>
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

create index if not exists idx_evlog_entity on event_log(entity_type, entity_id);
create index if not exists idx_evlog_action on event_log(action);
create index if not exists idx_evlog_time   on event_log(created_at desc);

-- ============================================================
-- TRIGGERS — updated_at + auditoria automática
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated on leads;
create trigger trg_leads_updated before update on leads
  for each row execute function set_updated_at();

create or replace function log_lead_change() returns trigger as $$
begin
  insert into event_log(entity_type, entity_id, action, metadata)
  values(
    'lead', new.id,
    case when tg_op='INSERT' then 'created' else 'status_changed' end,
    jsonb_build_object('old_status', case when tg_op='UPDATE' then old.status end,
                       'new_status', new.status,
                       'company', new.company_name)
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_audit_ins on leads;
create trigger trg_leads_audit_ins after insert on leads
  for each row execute function log_lead_change();

drop trigger if exists trg_leads_audit_upd on leads;
create trigger trg_leads_audit_upd after update of status on leads
  for each row execute function log_lead_change();

-- ============================================================
-- VIEW — métricas do dashboard
-- ============================================================
create or replace view dashboard_metrics as
select
  (select count(*) from leads)                                   as total_leads,
  (select count(*) from leads where status='new')                as leads_new,
  (select count(*) from leads where status='contacted')          as leads_contacted,
  (select count(*) from leads where status='replied')            as leads_replied,
  (select count(*) from leads where status='qualified')          as leads_qualified,
  (select count(*) from leads where status='disqualified')       as leads_disqualified,
  (select count(*) from outreach where status='sent')            as msgs_sent,
  (select count(*) from outreach where channel='email'  and status='sent') as msgs_email,
  (select count(*) from outreach where channel='whatsapp' and status='sent') as msgs_whatsapp,
  (select count(*) from conversations where direction='inbound') as inbound_msgs,
  (select count(*) from qualifications where qualified)          as qualified_count,
  case
    when (select count(*) from leads where status in ('contacted','replied','qualified','disqualified')) > 0
    then round(100.0 * (select count(*) from leads where status='replied')
            / (select count(*) from leads where status in ('contacted','replied','qualified','disqualified')), 2)
    else 0
  end as reply_rate_pct;

-- ============================================================
-- RLS (preparado para multi-tenant futuro — desabilitado no MVP)
-- ============================================================
-- alter table leads enable row level security;
-- alter table outreach enable row level security;
-- alter table conversations enable row level security;
-- alter table qualifications enable row level security;
