-- ============================================================================
-- Target proposals: a salesperson may propose next year's / a revised target
-- for an assigned dealer; it only takes effect once a manager approves it.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists dealer_target_proposals (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  year         int not null check (year between 2020 and 2100),
  proposed_by  uuid not null references profiles(id),
  lines        jsonb not null default '{}'::jsonb,   -- { code: { target_qty, monthly_qty } }
  note         text,
  status       text not null default 'bekliyor' check (status in ('bekliyor','onaylandi','reddedildi')),
  reviewed_by  uuid references profiles(id),
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_dtp_company_year on dealer_target_proposals(company_id, year, status);
create index if not exists idx_dtp_status on dealer_target_proposals(status, created_at desc);
alter table dealer_target_proposals enable row level security;
drop policy if exists dtp_manager_all on dealer_target_proposals;
create policy dtp_manager_all on dealer_target_proposals for all using (is_manager()) with check (is_manager());
drop policy if exists dtp_select_own on dealer_target_proposals;
create policy dtp_select_own on dealer_target_proposals for select using (proposed_by = auth.uid());
drop policy if exists dtp_insert_own on dealer_target_proposals;
create policy dtp_insert_own on dealer_target_proposals for insert
  with check (proposed_by = auth.uid()
              and exists (select 1 from assignments a
                          where a.company_id = dealer_target_proposals.company_id and a.salesperson_id = auth.uid()));
drop policy if exists dtp_update_own_pending on dealer_target_proposals;
create policy dtp_update_own_pending on dealer_target_proposals for update
  using (proposed_by = auth.uid() and status = 'bekliyor')
  with check (proposed_by = auth.uid() and status = 'bekliyor');
