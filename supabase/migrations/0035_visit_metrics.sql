-- ============================================================================
-- Reporting metrics: how long a visit report took, which mode, voice use.
-- One row per visit, written by the wizard (owner) — managers read it in
-- Analiz. Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists visit_metrics (
  visit_id        uuid primary key references visits(id) on delete cascade,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  seconds_active  int not null default 0,
  mode            text not null default 'hizli' check (mode in ('hizli','detayli')),
  voice_used      boolean not null default false,
  voice_chars     int not null default 0,
  updated_at      timestamptz not null default now()
);
alter table visit_metrics enable row level security;
drop policy if exists visit_metrics_owner_all on visit_metrics;
create policy visit_metrics_owner_all on visit_metrics for all
  using (exists (select 1 from visits v where v.id = visit_metrics.visit_id and v.salesperson_id = auth.uid()))
  with check (exists (select 1 from visits v where v.id = visit_metrics.visit_id and v.salesperson_id = auth.uid()));
drop policy if exists visit_metrics_manager_select on visit_metrics;
create policy visit_metrics_manager_select on visit_metrics for select using (is_manager());
