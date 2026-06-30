-- ============================================================================
-- Weekly visit plans (haftalık ziyaret planı) + last-visit reporting view.
--
-- A salesperson builds a plan for a given week (Monday-anchored), adds the
-- companies they intend to visit, optionally pins a day / visit type / note,
-- then submits it. Plans for following weeks can be created independently.
--
-- The company_last_visit view feeds the "son ziyaret tarihi" screens for both
-- salespeople (their own customers) and managers (everyone). It is declared
-- security_invoker so the underlying RLS on `visits` applies to the caller.
--
-- Idempotent — also bundled into PATCH_SQL so existing deployments pick it up
-- on the next boot.
-- ============================================================================

-- Plan status enum (guarded create so re-runs are safe).
do $$ begin
  create type plan_status as enum ('taslak','gonderildi');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- visit_plans — one row per (salesperson, week).
-- ---------------------------------------------------------------------------
create table if not exists visit_plans (
  id             uuid primary key default gen_random_uuid(),
  salesperson_id uuid not null references profiles(id) on delete cascade,
  week_start     date not null,                       -- Monday of the ISO week
  status         plan_status not null default 'taslak',
  note           text,
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (salesperson_id, week_start)
);
create index if not exists idx_visit_plans_sp on visit_plans(salesperson_id, week_start);

-- ---------------------------------------------------------------------------
-- visit_plan_items — companies planned within a plan.
-- ---------------------------------------------------------------------------
create table if not exists visit_plan_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references visit_plans(id) on delete cascade,
  company_id   uuid not null references companies(id),
  planned_date date,                                  -- a specific day in the week (optional)
  visit_type   visit_type,                            -- planned visit kind (optional)
  note         text,
  created_at   timestamptz not null default now(),
  unique (plan_id, company_id)
);
create index if not exists idx_visit_plan_items_plan on visit_plan_items(plan_id);

-- ---------------------------------------------------------------------------
-- RLS — salesperson owns their plans; managers read all.
-- ---------------------------------------------------------------------------
alter table visit_plans      enable row level security;
alter table visit_plan_items enable row level security;

drop policy if exists visit_plans_select on visit_plans;
create policy visit_plans_select on visit_plans for select
  using (salesperson_id = auth.uid() or is_manager());
drop policy if exists visit_plans_insert on visit_plans;
create policy visit_plans_insert on visit_plans for insert
  with check (salesperson_id = auth.uid());
drop policy if exists visit_plans_update_own on visit_plans;
create policy visit_plans_update_own on visit_plans for update
  using (salesperson_id = auth.uid()) with check (salesperson_id = auth.uid());
drop policy if exists visit_plans_delete_own on visit_plans;
create policy visit_plans_delete_own on visit_plans for delete
  using (salesperson_id = auth.uid());

-- visit_plan_items inherit plan ownership (managers may read).
drop policy if exists vplan_items_select on visit_plan_items;
create policy vplan_items_select on visit_plan_items for select
  using (exists (
    select 1 from visit_plans p
    where p.id = visit_plan_items.plan_id
      and (p.salesperson_id = auth.uid() or is_manager())
  ));
drop policy if exists vplan_items_write on visit_plan_items;
create policy vplan_items_write on visit_plan_items for all
  using (exists (
    select 1 from visit_plans p
    where p.id = visit_plan_items.plan_id and p.salesperson_id = auth.uid()
  ))
  with check (exists (
    select 1 from visit_plans p
    where p.id = visit_plan_items.plan_id and p.salesperson_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- company_last_visit — last completed visit per company.
-- security_invoker => underlying RLS on `visits` applies to the caller, so a
-- salesperson sees only their own customers' history, a manager sees all.
-- ---------------------------------------------------------------------------
create or replace view company_last_visit
with (security_invoker = on) as
  select company_id,
         max(visit_date) as last_visit_date,
         count(*)        as visit_count
    from visits
   where status = 'tamamlandi'
     and deleted_at is null
   group by company_id;
