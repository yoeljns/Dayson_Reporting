-- ============================================================================
-- Yearly dealer targets per product category. Actuals are entered manually by
-- the office (no order system).
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists dealer_targets (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  year        int not null check (year between 2020 and 2100),
  status      text not null default 'taslak' check (status in ('taslak','mutabik','iptal')),
  agreed_at   date,
  agreed_with uuid references company_contacts(id),
  note        text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, year)
);
create table if not exists dealer_target_lines (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null references dealer_targets(id) on delete cascade,
  category_id uuid not null references product_categories(id),
  target_qty  int not null default 0,
  target_eur  numeric(14,2) not null default 0,
  actual_qty  int not null default 0,          -- entered manually by office
  actual_eur  numeric(14,2) not null default 0,
  unique (target_id, category_id)
);
alter table dealer_targets      enable row level security;
alter table dealer_target_lines enable row level security;
drop policy if exists dealer_targets_manager_all on dealer_targets;
create policy dealer_targets_manager_all on dealer_targets for all using (is_manager()) with check (is_manager());
drop policy if exists dealer_targets_select_assigned on dealer_targets;
create policy dealer_targets_select_assigned on dealer_targets for select
  using (exists (select 1 from assignments a
                 where a.company_id = dealer_targets.company_id and a.salesperson_id = auth.uid()));
drop policy if exists dealer_target_lines_manager_all on dealer_target_lines;
create policy dealer_target_lines_manager_all on dealer_target_lines for all using (is_manager()) with check (is_manager());
drop policy if exists dealer_target_lines_select_assigned on dealer_target_lines;
create policy dealer_target_lines_select_assigned on dealer_target_lines for select
  using (exists (select 1 from dealer_targets t join assignments a on a.company_id = t.company_id
                 where t.id = dealer_target_lines.target_id and a.salesperson_id = auth.uid()));
