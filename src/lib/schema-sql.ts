// AUTO-GENERATED from supabase/migrations/*.sql — do not edit by hand.
// Regenerate with `npm run gen:schema` after changing the migrations. Bundled
// so the runtime migrator (src/lib/bootstrap.ts) can apply the schema without
// filesystem access.

export const SCHEMA_SQL = `-- ============================================================================
-- Dayson Reporting — initial schema
-- Enums, tables, indexes, profiles trigger, RLS policies, complaint RPC.
-- Run order matters: enums → tables → functions → policies.
-- ============================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role            as enum ('salesperson','manager','admin');
create type segment              as enum ('A','B','C','D');
create type debt_status          as enum ('temiz','riskli','gecikmis','bloke');
create type company_kind         as enum ('distributor','non_customer');
create type visit_type           as enum ('telefon','yuz_yuze');
create type visit_status         as enum ('taslak','tamamlandi');
create type complaint_type       as enum ('urun_hatasi','fiyat_fatura_hatasi','servis_hatasi','teslimat','diger');
create type complaint_status     as enum ('acik','islemde','cozuldu','iptal');
create type complaint_owner_dept as enum ('kalite_uretim','muhasebe','lojistik','satis','yonetim');
create type question_input_type  as enum ('select','multiselect','boolean','number','date','text');
create type import_status        as enum ('basarili','kismi','hata');

-- ---------------------------------------------------------------------------
-- profiles (mirror of auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null default '',
  email      text not null default '',
  role       user_role not null default 'salesperson',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Read caller's role without tripping RLS recursion (SECURITY DEFINER).
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role() in ('manager','admin'), false)
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth_role() = 'admin', false)
$$;

-- Auto-create a profile row whenever a new auth user is created.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'salesperson')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- companies (distributors + non-customers, unified)
-- ---------------------------------------------------------------------------
create table companies (
  id          uuid primary key default gen_random_uuid(),
  kind        company_kind not null,
  name        text not null,
  logo_code   text,
  segment     segment,
  debt_status debt_status,
  city        text,
  phone       text,
  notes       text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index uq_companies_logo_code on companies(logo_code) where logo_code is not null;
create index idx_companies_kind on companies(kind);
create index idx_companies_name_trgm on companies using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- assignments (which salesperson owns which company)
-- ---------------------------------------------------------------------------
create table assignments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  salesperson_id uuid not null references profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (company_id, salesperson_id)
);
create index idx_assignments_sp on assignments(salesperson_id);
create index idx_assignments_company on assignments(company_id);

-- ---------------------------------------------------------------------------
-- questions / question_options (dynamic but structured visit form)
-- ---------------------------------------------------------------------------
create table questions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  label_tr    text not null,
  input_type  question_input_type not null,
  applies_to  visit_type[],            -- null = all visit types
  is_required boolean not null default true,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  value       text not null,
  label_tr    text not null,
  sort_order  int not null default 0
);
create index idx_question_options_q on question_options(question_id);

-- ---------------------------------------------------------------------------
-- visits + visit_answers
-- ---------------------------------------------------------------------------
create table visits (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  salesperson_id uuid not null references profiles(id),
  visit_type     visit_type not null,
  status         visit_status not null default 'taslak',
  visit_date     date not null default current_date,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_visits_sp_status on visits(salesperson_id, status);
create index idx_visits_company on visits(company_id);

create table visit_answers (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references visits(id) on delete cascade,
  question_id  uuid not null references questions(id),
  value_text   text,
  value_number numeric,
  value_date   date,
  unique (visit_id, question_id)
);
create index idx_visit_answers_visit on visit_answers(visit_id);

-- ---------------------------------------------------------------------------
-- complaints + complaint_events (work-order + timeline)
-- ---------------------------------------------------------------------------
create table complaints (
  id                 uuid primary key default gen_random_uuid(),
  -- Optional link to one of our distributors (the complainant may be tied to one).
  company_id         uuid references companies(id),
  -- The complainant need not be a registered company/user — capture them as text.
  complainant_name   text,
  complainant_phone  text,
  reported_by        uuid not null references profiles(id),
  visit_id           uuid references visits(id),
  type               complaint_type not null,
  owner_dept         complaint_owner_dept not null,
  assignee_id        uuid references profiles(id),
  status             complaint_status not null default 'acik',
  title              text not null,
  description        text not null,
  priority           int not null default 2,
  due_date           date,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_complaints_status on complaints(status);
create index idx_complaints_dept on complaints(owner_dept);
create index idx_complaints_reporter on complaints(reported_by);

create table complaint_events (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references complaints(id) on delete cascade,
  actor_id     uuid not null references profiles(id),
  from_status  complaint_status,
  to_status    complaint_status,
  note         text,
  created_at   timestamptz not null default now()
);
create index idx_complaint_events_cid on complaint_events(complaint_id, created_at);

-- ---------------------------------------------------------------------------
-- competitors + competitor_observations
-- ---------------------------------------------------------------------------
create table competitors (
  id        uuid primary key default gen_random_uuid(),
  name      text unique not null,
  is_active boolean not null default true
);

create table competitor_observations (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid not null references competitors(id),
  company_id     uuid references companies(id),
  salesperson_id uuid not null references profiles(id),
  visit_id       uuid references visits(id),
  product_name   text not null,
  observed_price numeric,
  currency       text not null default 'TRY',
  observed_at    date not null default current_date,
  city           text,
  note           text,
  created_at     timestamptz not null default now()
);
create index idx_compobs_competitor_date on competitor_observations(competitor_id, observed_at);
create index idx_compobs_sp on competitor_observations(salesperson_id);

-- ---------------------------------------------------------------------------
-- import_batches (audit)
-- ---------------------------------------------------------------------------
create table import_batches (
  id             uuid primary key default gen_random_uuid(),
  uploaded_by    uuid not null references profiles(id),
  filename       text not null,
  row_count      int,
  inserted_count int,
  updated_count  int,
  error_count    int,
  status         import_status not null,
  error_detail   jsonb,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- complaint status transition RPC (atomic status change + timeline event)
-- ---------------------------------------------------------------------------
create or replace function update_complaint_status(
  p_complaint_id uuid,
  p_to_status    complaint_status,
  p_note         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from complaint_status;
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  select status into v_from from complaints where id = p_complaint_id for update;
  if v_from is null then
    raise exception 'Şikayet bulunamadı';
  end if;

  -- Validate the workflow transition.
  if not (
    (v_from = 'acik'    and p_to_status in ('islemde','iptal')) or
    (v_from = 'islemde' and p_to_status in ('cozuldu','iptal'))
  ) then
    raise exception 'Geçersiz durum geçişi: % -> %', v_from, p_to_status;
  end if;

  if coalesce(trim(p_note), '') = '' then
    raise exception 'Durum değişikliği için açıklama (not) zorunludur';
  end if;

  update complaints
     set status = p_to_status,
         resolved_at = case when p_to_status = 'cozuldu' then now() else resolved_at end,
         updated_at = now()
   where id = p_complaint_id;

  insert into complaint_events (complaint_id, actor_id, from_status, to_status, note)
  values (p_complaint_id, v_uid, v_from, p_to_status, p_note);
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table profiles                enable row level security;
alter table companies               enable row level security;
alter table assignments             enable row level security;
alter table questions               enable row level security;
alter table question_options        enable row level security;
alter table visits                  enable row level security;
alter table visit_answers           enable row level security;
alter table complaints              enable row level security;
alter table complaint_events        enable row level security;
alter table competitors             enable row level security;
alter table competitor_observations enable row level security;
alter table import_batches          enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_select_self_or_mgr on profiles for select
  using (id = auth.uid() or is_manager());
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));
create policy profiles_admin_all on profiles for all
  using (is_admin()) with check (is_admin());

-- companies -----------------------------------------------------------------
create policy companies_select on companies for select
  using (
    kind = 'non_customer'
    or is_manager()
    or exists (
      select 1 from assignments a
      where a.company_id = companies.id and a.salesperson_id = auth.uid()
    )
  );
-- Salespeople may add non-customer companies on the fly.
create policy companies_insert_noncustomer on companies for insert
  with check (kind = 'non_customer' and created_by = auth.uid());
create policy companies_admin_write on companies for all
  using (is_admin()) with check (is_admin());

-- assignments ---------------------------------------------------------------
create policy assignments_select on assignments for select
  using (salesperson_id = auth.uid() or is_manager());
create policy assignments_admin_write on assignments for all
  using (is_admin()) with check (is_admin());

-- questions / options (everyone reads active set; admin manages) ------------
create policy questions_select on questions for select using (true);
create policy questions_admin_write on questions for all
  using (is_admin()) with check (is_admin());
create policy qoptions_select on question_options for select using (true);
create policy qoptions_admin_write on question_options for all
  using (is_admin()) with check (is_admin());

-- visits --------------------------------------------------------------------
create policy visits_select on visits for select
  using (salesperson_id = auth.uid() or is_manager());
create policy visits_insert on visits for insert
  with check (salesperson_id = auth.uid());
create policy visits_update_own on visits for update
  using (salesperson_id = auth.uid()) with check (salesperson_id = auth.uid());
create policy visits_delete_own on visits for delete
  using (salesperson_id = auth.uid());

-- visit_answers (inherit visit ownership) -----------------------------------
create policy vanswers_select on visit_answers for select
  using (exists (
    select 1 from visits v where v.id = visit_answers.visit_id
    and (v.salesperson_id = auth.uid() or is_manager())
  ));
create policy vanswers_write on visit_answers for all
  using (exists (
    select 1 from visits v where v.id = visit_answers.visit_id
    and v.salesperson_id = auth.uid()
  ))
  with check (exists (
    select 1 from visits v where v.id = visit_answers.visit_id
    and v.salesperson_id = auth.uid()
  ));

-- complaints ----------------------------------------------------------------
create policy complaints_select on complaints for select
  using (reported_by = auth.uid() or assignee_id = auth.uid() or is_manager());
create policy complaints_insert on complaints for insert
  with check (reported_by = auth.uid());
-- Status changes go through the RPC; direct updates limited to manager/admin.
create policy complaints_update_mgr on complaints for update
  using (is_manager()) with check (is_manager());

-- complaint_events ----------------------------------------------------------
create policy cevents_select on complaint_events for select
  using (exists (
    select 1 from complaints c where c.id = complaint_events.complaint_id
    and (c.reported_by = auth.uid() or c.assignee_id = auth.uid() or is_manager())
  ));
-- Inserts happen inside the SECURITY DEFINER RPC; allow manager manual notes.
create policy cevents_insert_mgr on complaint_events for insert
  with check (is_manager() and actor_id = auth.uid());

-- competitors (lookup) ------------------------------------------------------
create policy competitors_select on competitors for select using (true);
create policy competitors_admin_write on competitors for all
  using (is_admin()) with check (is_admin());

-- competitor_observations ---------------------------------------------------
create policy compobs_select on competitor_observations for select
  using (salesperson_id = auth.uid() or is_manager());
create policy compobs_insert on competitor_observations for insert
  with check (salesperson_id = auth.uid());
create policy compobs_update_own on competitor_observations for update
  using (salesperson_id = auth.uid()) with check (salesperson_id = auth.uid());

-- import_batches ------------------------------------------------------------
create policy imports_admin on import_batches for all
  using (is_admin()) with check (is_admin());
`;

export const SEED_SQL = `-- ============================================================================
-- Seed: standard visit question catalog (admin-editable later) + competitors.
-- All answers are select/enum/boolean so they stay analyzable. One free-text
-- "serbest_not" field is the single exception.
-- Idempotent: safe to re-run (on conflict do nothing).
-- ============================================================================

insert into questions (code, label_tr, input_type, applies_to, is_required, sort_order) values
  ('siparis_alindi',          'Sipariş alındı mı?',              'boolean', null, true,  10),
  ('siparis_alinmama_nedeni', 'Sipariş alınmadıysa neden?',      'select',  null, false, 20),
  ('ziyaret_amaci',           'Ziyaret amacı',                   'select',  null, true,  30),
  ('gorusulen_kisi_rolu',     'Görüşülen kişi',                  'select',  null, true,  40),
  ('genel_memnuniyet',        'Genel memnuniyet (1-5)',          'select',  null, true,  50),
  ('sonraki_aksiyon',         'Sonraki aksiyon',                 'select',  null, true,  60),
  ('sonraki_ziyaret_tarihi',  'Sonraki ziyaret tarihi',          'date',    null, false, 70),
  ('serbest_not',             'Serbest not',                     'text',    null, false, 80)
on conflict (code) do nothing;

-- Options for "siparis_alinmama_nedeni"
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('fiyat',        'Fiyat',          1),
  ('stok_yok',     'Stok yok',       2),
  ('ihtiyac_yok',  'İhtiyaç yok',    3),
  ('rakip_tercih', 'Rakibi tercih',  4),
  ('diger',        'Diğer',          5)
) as v(value, label_tr, sort_order) on true
where q.code = 'siparis_alinmama_nedeni'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Options for "ziyaret_amaci"
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('satis',          'Satış',           1),
  ('tahsilat',       'Tahsilat',        2),
  ('tanitim',        'Tanıtım',         3),
  ('sikayet_takip',  'Şikayet takibi',  4),
  ('rutin_ziyaret',  'Rutin ziyaret',   5),
  ('diger',          'Diğer',           6)
) as v(value, label_tr, sort_order) on true
where q.code = 'ziyaret_amaci'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Options for "gorusulen_kisi_rolu"
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('sahip',       'Firma sahibi',  1),
  ('satin_alma',  'Satın alma',    2),
  ('depo',        'Depo',          3),
  ('muhasebe',    'Muhasebe',      4),
  ('diger',       'Diğer',         5)
) as v(value, label_tr, sort_order) on true
where q.code = 'gorusulen_kisi_rolu'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Options for "genel_memnuniyet" (1-5)
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('1', '1 - Çok kötü', 1),
  ('2', '2 - Kötü',     2),
  ('3', '3 - Orta',     3),
  ('4', '4 - İyi',      4),
  ('5', '5 - Çok iyi',  5)
) as v(value, label_tr, sort_order) on true
where q.code = 'genel_memnuniyet'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Options for "sonraki_aksiyon"
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('teklif_gonder',    'Teklif gönder',       1),
  ('numune_gonder',    'Numune gönder',       2),
  ('tekrar_ziyaret',   'Tekrar ziyaret',      3),
  ('tahsilat_takip',   'Tahsilat takibi',     4),
  ('aksiyon_yok',      'Aksiyon yok',         5)
) as v(value, label_tr, sort_order) on true
where q.code = 'sonraki_aksiyon'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Competitors are added from the field (searchable + add-on-the-fly), so no
-- placeholder rows are seeded here.
`;

export const PATCH_PRE_SQL = `-- ────── 0019_enums_kinds_plans.sql ──────
-- ============================================================================
-- Enum additions ONLY. This file is bundled into PATCH_PRE_SQL and applied in
-- its own transaction BEFORE the rest of the patches, because Postgres refuses
-- to use a new enum value inside the transaction that added it. Anything that
-- references these values lives in 0020+.
--
-- Applying by hand (SQL editor): run this file on its own first.
-- ============================================================================
select pg_advisory_xact_lock(872764184);

-- plan_status is created by 0006 (a PATCH file). On a fresh install this file
-- runs before it, so create the type here; 0006's guarded create then no-ops.
do $$ begin
  create type plan_status as enum ('taslak','gonderildi');
exception when duplicate_object then null; end $$;

alter type company_kind add value if not exists 'sub_dealer';
alter type company_kind add value if not exists 'competitor_point';
alter type plan_status  add value if not exists 'onaylandi';
alter type plan_status  add value if not exists 'reddedildi';
`;

export const PATCH_SQL = `-- ────── 0003_complainant.sql ──────
-- ============================================================================
-- Patch: complaints can be raised by someone NOT registered in the system,
-- optionally linked to one of our distributors.
-- Idempotent — safe to run on every boot (handled by the runtime bootstrap).
-- ============================================================================

alter table complaints add column if not exists complainant_name  text;
alter table complaints add column if not exists complainant_phone text;

-- The distributor link is optional now (the complainant may be external).
alter table complaints alter column company_id drop not null;

-- ────── 0004_competitor_insert.sql ──────
-- ============================================================================
-- Let salespeople add competitors on the fly from the field, and remove the
-- placeholder "Rakip A/B/C" seed rows (only if unused).
-- Idempotent — applied on every boot by the runtime bootstrap.
-- ============================================================================

drop policy if exists competitors_insert_auth on competitors;
create policy competitors_insert_auth on competitors for insert
  with check (auth.uid() is not null);

delete from competitors c
 where c.name in ('Rakip A', 'Rakip B', 'Rakip C')
   and not exists (
     select 1 from competitor_observations o where o.competitor_id = c.id
   );

-- ────── 0005_soft_delete.sql ──────
-- ============================================================================
-- Soft-delete (archive) for visits (drafts) and companies, so "deleted" items
-- are hidden from lists but kept on record and never break linked reports.
-- Idempotent — applied on every boot by the runtime bootstrap.
-- ============================================================================

alter table visits add column if not exists deleted_at timestamptz;
alter table visits add column if not exists deleted_by uuid references profiles(id);

alter table companies add column if not exists deleted_at timestamptz;

-- ────── 0006_visit_plans.sql ──────
-- ============================================================================
-- Weekly visit plans (haftalık ziyaret planı) + last-visit reporting view.
--
-- A salesperson builds a plan for a given week (Monday-anchored), adds the
-- companies they intend to visit, optionally pins a day / visit type / note,
-- then submits it. Plans for following weeks can be created independently.
--
-- The company_last_visit view feeds the "son ziyaret tarihi" screens for both
-- salespeople (their own customers) and managers (everyone). It is declared
-- security_invoker so the underlying RLS on \`visits\` applies to the caller.
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
-- security_invoker => underlying RLS on \`visits\` applies to the caller, so a
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

-- ────── 0007_app_settings.sql ──────
-- ============================================================================
-- app_settings — small key/value store for admin-tunable app configuration.
-- First use: the end-of-day "tamamlanmamış raporları bitir" reminder time.
--
-- Everyone signed in may read settings (the salesperson app needs the reminder
-- time); only admins may change them.
--
-- Idempotent — also bundled into PATCH_SQL so existing deployments pick it up.
-- ============================================================================

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table app_settings enable row level security;

drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings for select
  using (auth.uid() is not null);

drop policy if exists app_settings_admin_write on app_settings;
create policy app_settings_admin_write on app_settings for all
  using (is_admin()) with check (is_admin());

-- Seed the end-of-day reminder default (18:00, on). do-nothing on conflict so
-- an admin's later change is never overwritten on boot.
insert into app_settings (key, value)
values ('eod_reminder', '{"enabled": true, "hour": 18, "minute": 0}'::jsonb)
on conflict (key) do nothing;

-- Weekly plan-submission deadline default: Monday (weekday 0) 09:00.
insert into app_settings (key, value)
values ('plan_deadline', '{"enabled": true, "weekday": 0, "hour": 9, "minute": 0}'::jsonb)
on conflict (key) do nothing;

-- ────── 0008_products_contacts.sql ──────
-- ============================================================================
-- Visit wizard support: remembered contacts, company-kind-scoped questions,
-- and the product/brand competition matrix.
--
-- New question_input_type values are intentionally NOT added (ALTER TYPE ADD
-- VALUE is unsafe to use within the same boot transaction). The new steps use
-- dedicated tables + a company_kind filter + a text/check column instead.
--
-- Idempotent — also bundled into PATCH_SQL so existing deployments pick it up.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- company_contacts — a person met at a company (name + phone [+ role]).
-- Remembered per company and suggested on the next visit.
-- ---------------------------------------------------------------------------
create table if not exists company_contacts (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  phone      text,
  role       text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_company_contacts_company on company_contacts(company_id);

alter table company_contacts enable row level security;

drop policy if exists company_contacts_select on company_contacts;
create policy company_contacts_select on company_contacts for select
  using (
    is_manager()
    or exists (
      select 1 from companies c
      where c.id = company_contacts.company_id
        and (
          c.kind = 'non_customer'
          or exists (
            select 1 from assignments a
            where a.company_id = c.id and a.salesperson_id = auth.uid()
          )
        )
    )
  );
drop policy if exists company_contacts_insert on company_contacts;
create policy company_contacts_insert on company_contacts for insert
  with check (created_by = auth.uid());
drop policy if exists company_contacts_update_own on company_contacts;
create policy company_contacts_update_own on company_contacts for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Visit -> chosen contact for that visit.
alter table visits add column if not exists contact_id uuid references company_contacts(id);

-- Company-kind-scoped questions (e.g. HİZ.VEREN.BAYİ only for non_customer).
-- null = applies to all kinds.
alter table questions add column if not exists applies_to_kind company_kind[];

-- ---------------------------------------------------------------------------
-- Product competition matrix: categories × brands, and per-visit answers.
-- ---------------------------------------------------------------------------
create table if not exists product_categories (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  label_tr   text not null,
  note       text,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists product_brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
-- Case-insensitive uniqueness so "3M" / "3m" don't duplicate.
create unique index if not exists uq_product_brands_name on product_brands(lower(name));

-- Which brands appear as options for a category. salesperson_id null = global
-- (admin-seeded); non-null = a rep's own "Diğer" addition (suggested to them).
create table if not exists product_category_brands (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references product_categories(id) on delete cascade,
  brand_id       uuid not null references product_brands(id) on delete cascade,
  is_own         boolean not null default false,
  sort_order     int not null default 0,
  salesperson_id uuid references profiles(id) on delete cascade,
  created_at     timestamptz not null default now()
);
create index if not exists idx_pcb_category on product_category_brands(category_id);
create unique index if not exists uq_pcb_global on product_category_brands(category_id, brand_id)
  where salesperson_id is null;
create unique index if not exists uq_pcb_sp on product_category_brands(category_id, brand_id, salesperson_id)
  where salesperson_id is not null;

create table if not exists visit_product_answers (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references visits(id) on delete cascade,
  category_id uuid not null references product_categories(id),
  brand_id    uuid references product_brands(id),
  custom_name text,
  supply_kind text not null default 'brand'
    check (supply_kind in ('brand','own_production','export')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_vpa_visit on visit_product_answers(visit_id);

-- RLS: catalogs are readable by all authenticated; admins manage; salespeople
-- may add brands + their own category links (the "Diğer" flow).
alter table product_categories      enable row level security;
alter table product_brands          enable row level security;
alter table product_category_brands enable row level security;
alter table visit_product_answers   enable row level security;

drop policy if exists product_categories_select on product_categories;
create policy product_categories_select on product_categories for select using (true);
drop policy if exists product_categories_admin_write on product_categories;
create policy product_categories_admin_write on product_categories for all
  using (is_admin()) with check (is_admin());

drop policy if exists product_brands_select on product_brands;
create policy product_brands_select on product_brands for select using (true);
drop policy if exists product_brands_insert_auth on product_brands;
create policy product_brands_insert_auth on product_brands for insert
  with check (auth.uid() is not null);
drop policy if exists product_brands_admin_write on product_brands;
create policy product_brands_admin_write on product_brands for all
  using (is_admin()) with check (is_admin());

drop policy if exists pcb_select on product_category_brands;
create policy pcb_select on product_category_brands for select using (true);
drop policy if exists pcb_insert_own on product_category_brands;
create policy pcb_insert_own on product_category_brands for insert
  with check (is_admin() or salesperson_id = auth.uid());
drop policy if exists pcb_admin_write on product_category_brands;
create policy pcb_admin_write on product_category_brands for all
  using (is_admin()) with check (is_admin());
drop policy if exists pcb_delete_own on product_category_brands;
create policy pcb_delete_own on product_category_brands for delete
  using (is_admin() or salesperson_id = auth.uid());

drop policy if exists vpa_select on visit_product_answers;
create policy vpa_select on visit_product_answers for select
  using (exists (
    select 1 from visits v where v.id = visit_product_answers.visit_id
    and (v.salesperson_id = auth.uid() or is_manager())
  ));
drop policy if exists vpa_write on visit_product_answers;
create policy vpa_write on visit_product_answers for all
  using (exists (
    select 1 from visits v where v.id = visit_product_answers.visit_id
    and v.salesperson_id = auth.uid()
  ))
  with check (exists (
    select 1 from visits v where v.id = visit_product_answers.visit_id
    and v.salesperson_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Seed: HİZ.VEREN.BAYİ question (non_customer only) + notes label + matrix.
-- ---------------------------------------------------------------------------
insert into questions (code, label_tr, input_type, applies_to, applies_to_kind, is_required, sort_order)
values ('hiz_veren_bayi', 'Hizmet veren bayi', 'text', null, array['non_customer']::company_kind[], false, 75)
on conflict (code) do nothing;

update questions set label_tr = 'Ziyaret notları'
 where code = 'serbest_not' and label_tr = 'Serbest not';

-- Product categories (order matters).
insert into product_categories (code, label_tr, sort_order) values
  ('pu',        'PU (Poliüretan Köpük)',        10),
  ('sos',       'Sosis',                        20),
  ('b35',       'Maskeleme Bandı 35 mt',        30),
  ('b30',       'Maskeleme Bandı 30 mt',        40),
  ('h25',       'Maskeleme Bandı 25 mt',        50),
  ('koli_bant', 'Koli Bandı',                   60),
  ('kornis',    'Korniş / High Tack',           70),
  ('soft',      'Soft (Rulo Sünger Zımpara)',   80),
  ('cirt_zimp', 'Cırt Zımpara',                 90),
  ('su_kuru',   'Su / Kuru Zımpara',            100)
on conflict (code) do nothing;

-- Brand catalog.
insert into product_brands (name) values
  ('Dayson'),('Selsil'),('Soudal'),('Akfix'),('Somafix'),('Akkim'),('Den Braven'),
  ('Penosil'),('Tytan'),('VEGE'),('3M'),('Tesa'),('Beorol'),('Hasbant'),('Nora Bant'),
  ('Alfa Bant'),('Rulopak'),('Bison'),('Pattex'),('Smirdex'),('Atlas'),('Mirka'),
  ('Kovax'),('Klingspor'),('SIA'),('Bosch'),('Indasa'),('Norton'),('Deerfos'),('Starcke')
on conflict (lower(name)) do nothing;

-- Global category↔brand links (own = is_own true). Idempotent via the partial
-- unique index (category_id, brand_id) where salesperson_id is null.
insert into product_category_brands (category_id, brand_id, is_own, sort_order)
select c.id, b.id, v.is_own, v.sort_order
from (values
  -- category_code, brand_name, is_own, sort
  ('pu','Dayson',true,1),('pu','Selsil',false,2),('pu','Soudal',false,3),('pu','Akfix',false,4),
  ('pu','Somafix',false,5),('pu','Akkim',false,6),('pu','Den Braven',false,7),('pu','Penosil',false,8),
  ('sos','Dayson',true,1),('sos','Selsil',false,2),('sos','Soudal',false,3),('sos','Akfix',false,4),
  ('sos','Somafix',false,5),('sos','Akkim',false,6),('sos','Tytan',false,7),
  ('b35','Dayson',true,1),('b35','VEGE',false,2),('b35','3M',false,3),('b35','Tesa',false,4),
  ('b35','Beorol',false,5),('b35','Hasbant',false,6),('b35','Nora Bant',false,7),
  ('b30','Dayson',true,1),('b30','VEGE',false,2),('b30','3M',false,3),('b30','Tesa',false,4),
  ('b30','Beorol',false,5),('b30','Hasbant',false,6),('b30','Nora Bant',false,7),
  ('h25','Tesa',false,1),('h25','3M',false,2),('h25','Beorol',false,3),('h25','Hasbant',false,4),
  ('h25','Nora Bant',false,5),('h25','Alfa Bant',false,6),('h25','VEGE',false,7),
  ('koli_bant','VEGE',false,1),('koli_bant','3M',false,2),('koli_bant','Tesa',false,3),
  ('koli_bant','Hasbant',false,4),('koli_bant','Nora Bant',false,5),('koli_bant','Rulopak',false,6),
  ('koli_bant','Alfa Bant',false,7),
  ('kornis','Selsil',false,1),('kornis','Soudal',false,2),('kornis','Tytan',false,3),
  ('kornis','Akfix',false,4),('kornis','Bison',false,5),('kornis','Pattex',false,6),('kornis','Den Braven',false,7),
  ('soft','Dayson',true,1),('soft','Smirdex',false,2),('soft','Atlas',false,3),('soft','Mirka',false,4),
  ('soft','3M',false,5),('soft','Kovax',false,6),('soft','Klingspor',false,7),
  ('cirt_zimp','Dayson',true,1),('cirt_zimp','SIA',true,2),('cirt_zimp','Mirka',false,3),
  ('cirt_zimp','Smirdex',false,4),('cirt_zimp','Klingspor',false,5),('cirt_zimp','Bosch',false,6),
  ('cirt_zimp','Indasa',false,7),('cirt_zimp','Norton',false,8),('cirt_zimp','3M',false,9),('cirt_zimp','Deerfos',false,10),
  ('su_kuru','SIA',true,1),('su_kuru','Smirdex',false,2),('su_kuru','Klingspor',false,3),
  ('su_kuru','Norton',false,4),('su_kuru','3M',false,5),('su_kuru','Starcke',false,6),
  ('su_kuru','Indasa',false,7),('su_kuru','Kovax',false,8),('su_kuru','Deerfos',false,9)
) as v(cat_code, brand_name, is_own, sort_order)
join product_categories c on c.code = v.cat_code
join product_brands b on lower(b.name) = lower(v.brand_name)
on conflict do nothing;

-- Atomically replace a visit's product-competition answers (delete + insert in
-- one transaction). security invoker so the caller's RLS still applies.
create or replace function replace_visit_products(p_visit_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from visit_product_answers where visit_id = p_visit_id;
  insert into visit_product_answers (visit_id, category_id, brand_id, custom_name, supply_kind)
  select p_visit_id,
         (r->>'category_id')::uuid,
         nullif(r->>'brand_id', '')::uuid,
         nullif(r->>'custom_name', ''),
         coalesce(nullif(r->>'supply_kind', ''), 'brand')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end;
$$;

-- ────── 0009_complaint_product_cleanup.sql ──────
-- ============================================================================
-- Complaint → product link + one-time catalog cleanup.
-- Idempotent — also bundled into PATCH_SQL.
-- ============================================================================

alter table complaints add column if not exists product_category_id uuid references product_categories(id);

update questions set label_tr = 'Sonraki ziyaret tarihi (opsiyonel)'
 where code = 'sonraki_ziyaret_tarihi' and label_tr = 'Sonraki ziyaret tarihi';

-- One-time cleanup (guarded so it never overrides later admin choices): hide the
-- satisfaction + contact-role questions and deactivate the removed brands.
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_cleanup_v1') then
    update questions set is_active = false
      where code in ('genel_memnuniyet', 'gorusulen_kisi_rolu');
    update product_brands set is_active = false
      where lower(name) = any (array[
        'den braven','penosil','3m','beorol','alfa bant','rulopak',
        'bison','pattex','kovax','klingspor','deerfos','starcke']);
    insert into app_settings (key, value)
      values ('catalog_cleanup_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;

-- ────── 0010_answer_detail.sql ──────
-- ============================================================================
-- Free-text detail for "Diğer" answers + relabel a sonraki_aksiyon option.
-- Idempotent — also bundled into PATCH_SQL.
-- ============================================================================

-- Detail text captured when a select answer is "diger" (Diğer).
alter table visit_answers add column if not exists value_detail text;

-- "Aksiyon yok" → "Takip" (keep the value 'aksiyon_yok' so past answers survive).
update question_options o set label_tr = 'Takip'
from questions q
where o.question_id = q.id and q.code = 'sonraki_aksiyon'
  and o.value = 'aksiyon_yok' and o.label_tr = 'Aksiyon yok';

-- ────── 0011_products_restructure.sql ──────
-- ============================================================================
-- Product matrix restructure: PU, Extra PU, Tixo, single Maskeleme Bandı (with
-- our 6 tape types as options), Soft, Cırt, Su/Kuru. The length-based masking
-- categories and Sosis / Koli Bandı / Korniş are retired.
-- Idempotent — also bundled into PATCH_SQL.
-- ============================================================================

insert into product_categories (code, label_tr, sort_order) values
  ('extra_pu',  'Extra PU',        15),
  ('tixo',      'Tixo',            18),
  ('maskeleme', 'Maskeleme Bandı', 30)
on conflict (code) do nothing;

insert into product_brands (name) values
  ('UNI Beyaz'),('UNI Sarı'),('Kahve Extra'),
  ('Beyaz Extra'),('Beyaz Klasik'),('Sarı Klasik')
on conflict (lower(name)) do nothing;

insert into product_category_brands (category_id, brand_id, is_own, sort_order)
select c.id, b.id, v.is_own, v.sort_order
from (values
  ('maskeleme','UNI Beyaz',true,1),('maskeleme','UNI Sarı',true,2),('maskeleme','Kahve Extra',true,3),
  ('maskeleme','Beyaz Extra',true,4),('maskeleme','Beyaz Klasik',true,5),('maskeleme','Sarı Klasik',true,6),
  ('maskeleme','VEGE',false,7),('maskeleme','Tesa',false,8),('maskeleme','Hasbant',false,9),('maskeleme','Nora Bant',false,10),
  ('extra_pu','Dayson',true,1),('extra_pu','Selsil',false,2),('extra_pu','Soudal',false,3),
  ('extra_pu','Akfix',false,4),('extra_pu','Somafix',false,5),('extra_pu','Akkim',false,6),
  ('tixo','Dayson',true,1)
) as v(cat_code, brand_name, is_own, sort_order)
join product_categories c on c.code = v.cat_code
join product_brands b on lower(b.name) = lower(v.brand_name)
on conflict do nothing;

-- Retire the old categories (guarded once so admin choices aren't overridden).
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_restructure_v1') then
    update product_categories set is_active = false
      where code in ('sos','koli_bant','kornis','b35','b30','h25');
    insert into app_settings (key, value)
      values ('catalog_restructure_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;

-- ────── 0012_drafts.sql ──────
-- ============================================================================
-- Drafts for complaints and competitor observations. A "Taslak kaydet" button
-- saves an incomplete record; it can be resumed and finalized later. Drafts are
-- private to the reporter and excluded from manager queues + reports.
-- Idempotent — also bundled into PATCH_SQL.
-- ============================================================================

alter table complaints              add column if not exists is_draft boolean not null default false;
alter table competitor_observations add column if not exists is_draft boolean not null default false;

-- Reporters may finalize/edit their OWN draft complaints. Once is_draft flips to
-- false the USING clause no longer matches, so a finalized complaint can only be
-- changed by a manager (or the status RPC) — same as before. The WITH CHECK pins
-- the workflow columns to safe defaults so finalization only flips is_draft and
-- cannot forge a resolved/assigned state or bypass update_complaint_status.
drop policy if exists complaints_update_own_draft on complaints;
create policy complaints_update_own_draft on complaints for update
  using (reported_by = auth.uid() and is_draft)
  with check (
    reported_by = auth.uid()
    and status = 'acik'
    and assignee_id is null
    and resolved_at is null
  );

-- Reporters may write the single opening event ('acik') on their OWN complaint
-- (used when a complaint is finalized). All other events go through the RPC.
drop policy if exists cevents_insert_reporter on complaint_events;
create policy cevents_insert_reporter on complaint_events for insert
  with check (
    actor_id = auth.uid()
    and to_status = 'acik'
    and from_status is null
    and exists (
      select 1 from complaints c
      where c.id = complaint_events.complaint_id and c.reported_by = auth.uid()
    )
  );

-- ────── 0013_pu_only.sql ──────
-- ============================================================================
-- Merge only the PU-family mastics (PU, Extra PU, Tixo) into a single
-- "PU mastik" category. Bands (Maskeleme Bandı) and sandpapers (Soft,
-- Cırt Zımpara, Su/Kuru) STAY active. Guarded once via
-- app_settings.catalog_pu_only_v1. Idempotent — also in PATCH_SQL.
-- ============================================================================
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_pu_only_v1') then
    update product_categories set is_active = false where code in ('extra_pu', 'tixo');
    update product_categories set is_active = true, label_tr = 'PU mastik' where code = 'pu';
    insert into app_settings (key, value)
      values ('catalog_pu_only_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;

-- ────── 0014_restore_bands.sql ──────
-- ============================================================================
-- Repair migration. An earlier version of 0013 wrongly deactivated the bands
-- and sandpapers along with the PU-family merge. Restore Maskeleme Bandı, Soft,
-- Cırt Zımpara and Su/Kuru; the PU-family (Extra PU, Tixo) stays merged into the
-- single "PU mastik" category. Guarded once via catalog_pu_bands_restore_v1.
-- Idempotent — also in PATCH_SQL.
-- ============================================================================
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_pu_bands_restore_v1') then
    update product_categories set is_active = true
      where code in ('maskeleme', 'soft', 'cirt_zimp', 'su_kuru');
    insert into app_settings (key, value)
      values ('catalog_pu_bands_restore_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;

-- ────── 0015_masking_split.sql ──────
-- ============================================================================
-- Restore the length-based masking categories (Maskeleme Bandı 35/30/25 mt) and
-- the Korniş / High Tack category; retire the single "Maskeleme Bandı". These
-- rows were only deactivated by the earlier restructure, so flipping is_active
-- back on brings their brand links along. Guarded once via
-- app_settings.catalog_masking_split_v1. Idempotent — also in PATCH_SQL.
-- ============================================================================
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_masking_split_v1') then
    update product_categories set is_active = true
      where code in ('b35', 'b30', 'h25', 'kornis');
    update product_categories set is_active = false where code = 'maskeleme';
    insert into app_settings (key, value)
      values ('catalog_masking_split_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;

-- ────── 0016_security.sql ──────
-- ============================================================================
-- Security hardening. Idempotent — also bundled into PATCH_SQL.
--
-- (1) handle_new_user: stop reading the role from raw_user_meta_data. That
--     value is client-controlled at signup, so a public anon-key signUp() call
--     with options.data.role='admin' could mint an admin profile. Every trusted
--     flow (createUser / inviteUser / createFirstAdmin) already sets the real
--     role via a profiles UPDATE right after creating the auth user, so
--     hardcoding 'salesperson' here breaks nothing.
--     ALSO: disable public signups in Supabase Auth settings (dashboard).
--
-- (2) update_complaint_status: SECURITY DEFINER bypasses RLS, so the function
--     body must authorize. Require manager OR reporter/assignee, reject drafts,
--     and allow a manager-only reopen (cozuldu/iptal -> islemde) so closed
--     complaints are no longer permanent dead ends.
-- ============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    'salesperson'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function update_complaint_status(
  p_complaint_id uuid,
  p_to_status    complaint_status,
  p_note         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from     complaint_status;
  v_reporter uuid;
  v_assignee uuid;
  v_is_draft boolean;
  v_uid      uuid := auth.uid();
  v_manager  boolean;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  select status, reported_by, assignee_id, is_draft
    into v_from, v_reporter, v_assignee, v_is_draft
    from complaints where id = p_complaint_id for update;
  if v_from is null then
    raise exception 'Şikayet bulunamadı';
  end if;

  v_manager := is_manager();
  -- coalesce: with assignee_id NULL (the default) "v_assignee = v_uid" is NULL,
  -- and IF NOT NULL would silently skip the raise — bypassing the check.
  if not (v_manager
          or coalesce(v_reporter = v_uid, false)
          or coalesce(v_assignee = v_uid, false)) then
    raise exception 'Bu şikayet üzerinde yetkiniz yok';
  end if;

  if v_is_draft then
    raise exception 'Taslak şikayetin durumu değiştirilemez';
  end if;

  -- Validate the workflow transition (managers may also reopen closed ones).
  if not (
    (v_from = 'acik'    and p_to_status in ('islemde','iptal')) or
    (v_from = 'islemde' and p_to_status in ('cozuldu','iptal')) or
    (v_manager and v_from in ('cozuldu','iptal') and p_to_status = 'islemde')
  ) then
    raise exception 'Geçersiz durum geçişi: % -> %', v_from, p_to_status;
  end if;

  if coalesce(trim(p_note), '') = '' then
    raise exception 'Durum değişikliği için açıklama (not) zorunludur';
  end if;

  update complaints
     set status = p_to_status,
         resolved_at = case
           when p_to_status = 'cozuldu' then now()
           when v_from in ('cozuldu','iptal') then null
           else resolved_at
         end,
         updated_at = now()
   where id = p_complaint_id;

  insert into complaint_events (complaint_id, actor_id, from_status, to_status, note)
  values (p_complaint_id, v_uid, v_from, p_to_status, p_note);
end;
$$;

-- ────── 0017_atomic_answers.sql ──────
-- ============================================================================
-- Atomic replace of a visit's answers. saveVisit previously deleted all
-- visit_answers rows and re-inserted them as two separate PostgREST calls; a
-- failed insert (constraint violation, transient error) permanently wiped the
-- visit's saved answers. Single-transaction RPC — same pattern as
-- replace_visit_products. SECURITY INVOKER, so RLS still limits reps to their
-- own visits. Idempotent — also bundled into PATCH_SQL.
-- ============================================================================
create or replace function replace_visit_answers(p_visit_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from visit_answers where visit_id = p_visit_id;
  insert into visit_answers (visit_id, question_id, value_text, value_number, value_date, value_detail)
  select p_visit_id,
         (r->>'question_id')::uuid,
         nullif(r->>'value_text', ''),
         (nullif(r->>'value_number', ''))::numeric,
         (nullif(r->>'value_date', ''))::date,
         nullif(r->>'value_detail', '')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end;
$$;

-- ────── 0018_management_mode.sql ──────
-- 0018_management_mode.sql
-- Per-user UI preference: managers/admins run the app in "management mode"
-- (viewing + oversight) instead of the salesperson reporting screens.
-- NULL means "use the role default" (managers default to management mode),
-- so existing rows need no backfill.

alter table profiles add column if not exists management_mode boolean;

comment on column profiles.management_mode is
  'UI mode for managers/admins: true = management/viewing, false = reporting, null = role default.';

-- ────── 0020_company_kinds.sql ──────
-- ============================================================================
-- Four company kinds (Bayi · Potansiyel bayi · Alt bayi · Rakip noktası),
-- plate code, "buys via dealer" link, and field registration that assigns the
-- registering salesperson. Enum values come from 0019 (pre-phase).
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
alter table companies add column if not exists plate_code text;
alter table companies add column if not exists buys_from_company_id uuid references companies(id);
do $$ begin
  alter table companies add constraint companies_plate_code_chk
    check (plate_code is null or plate_code ~ '^[0-9]{2}$');
exception when duplicate_object then null; end $$;
create index if not exists idx_companies_plate on companies(plate_code);
create index if not exists idx_companies_buys_from on companies(buys_from_company_id);

-- Every non-distributor kind is visible to all reps (was: only non_customer).
drop policy if exists companies_select on companies;
create policy companies_select on companies for select
  using (
    kind <> 'distributor'
    or is_manager()
    or exists (select 1 from assignments a
               where a.company_id = companies.id and a.salesperson_id = auth.uid())
  );
drop policy if exists companies_insert_noncustomer on companies;
create policy companies_insert_noncustomer on companies for insert
  with check (kind in ('non_customer','sub_dealer','competitor_point') and created_by = auth.uid());
-- Reps may correct plate / buys_from on companies they registered.
drop policy if exists companies_update_own_field on companies;
create policy companies_update_own_field on companies for update
  using (created_by = auth.uid() and kind <> 'distributor')
  with check (created_by = auth.uid() and kind <> 'distributor');

-- company_contacts_select referenced kind = 'non_customer'.
drop policy if exists company_contacts_select on company_contacts;
create policy company_contacts_select on company_contacts for select
  using (
    is_manager()
    or exists (select 1 from companies c
               where c.id = company_contacts.company_id
                 and (c.kind <> 'distributor'
                      or exists (select 1 from assignments a
                                 where a.company_id = c.id and a.salesperson_id = auth.uid())))
  );

-- Field registration: creates (or reuses) the company AND assigns the caller.
-- p_id lets the offline queue replay idempotently.
create or replace function register_company_from_field(
  p_kind                 company_kind,
  p_name                 text,
  p_city                 text default null,
  p_plate_code           text default null,
  p_phone                text default null,
  p_buys_from_company_id uuid default null,
  p_notes                text default null,
  p_id                   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_name  text := trim(coalesce(p_name, ''));
  v_plate text := nullif(trim(coalesce(p_plate_code, '')), '');
begin
  if v_uid is null then raise exception 'Yetkisiz'; end if;
  if p_kind not in ('non_customer','sub_dealer','competitor_point') then
    raise exception 'Bu firma türü sahadan kaydedilemez';
  end if;
  if v_name = '' then raise exception 'Firma adı zorunludur'; end if;
  if v_plate is not null and v_plate !~ '^[0-9]{2}$' then
    raise exception 'Plaka kodu 2 haneli olmalı';
  end if;
  if p_buys_from_company_id is not null and not exists (
    select 1 from companies where id = p_buys_from_company_id
      and kind = 'distributor' and deleted_at is null) then
    raise exception 'Hizmet veren bayi bulunamadı';
  end if;

  if p_id is not null then
    select id into v_id from companies where id = p_id;          -- replayed op
  end if;
  if v_id is null then
    select id into v_id from companies
     where kind = p_kind and deleted_at is null and lower(name) = lower(v_name)
     limit 1;                                                    -- duplicate name
  end if;
  if v_id is null then
    insert into companies (id, kind, name, city, plate_code, phone,
                           buys_from_company_id, notes, created_by)
    values (coalesce(p_id, gen_random_uuid()), p_kind, v_name,
            nullif(trim(coalesce(p_city,'')), ''), v_plate,
            nullif(trim(coalesce(p_phone,'')), ''), p_buys_from_company_id,
            nullif(trim(coalesce(p_notes,'')), ''), v_uid)
    returning id into v_id;
  end if;

  insert into assignments (company_id, salesperson_id, role)
  values (v_id, v_uid,
          case when exists (select 1 from assignments where company_id = v_id and role = 'owner')
               then 'backup' else 'owner' end)
  on conflict (company_id, salesperson_id) do nothing;
  return v_id;
end;
$$;

-- ────── 0021_assignment_roles.sql ──────
-- ============================================================================
-- Several salespeople per company: one owner (Sorumlu) + any number of
-- backups (Yedek). Managers manage assignments through RLS as well.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
alter table assignments add column if not exists role text not null default 'owner';
do $$ begin
  alter table assignments add constraint assignments_role_chk check (role in ('owner','backup'));
exception when duplicate_object then null; end $$;
-- Exactly one owner per company (oldest row keeps it). Idempotent.
update assignments a set role = 'backup'
 where a.role = 'owner'
   and exists (select 1 from assignments b
               where b.company_id = a.company_id and b.role = 'owner'
                 and (b.created_at, b.id) < (a.created_at, a.id));
create unique index if not exists uq_assignments_owner on assignments(company_id) where role = 'owner';
drop policy if exists assignments_manager_write on assignments;
create policy assignments_manager_write on assignments for all
  using (is_manager()) with check (is_manager());

-- ────── 0022_plan_approval.sql ──────
-- ============================================================================
-- Weekly plan approval: manager approves or rejects (with a note). Enum values
-- 'onaylandi' / 'reddedildi' come from 0019. 'gonderildi' now means "awaiting
-- approval".
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
alter table visit_plans add column if not exists approved_by  uuid references profiles(id);
alter table visit_plans add column if not exists decided_at   timestamptz;
alter table visit_plans add column if not exists manager_note text;

-- A rep's own update can never produce a decided state: any rep write lands in
-- taslak/gonderildi with the decision cleared (reopen/submit set these nulls).
drop policy if exists visit_plans_update_own on visit_plans;
create policy visit_plans_update_own on visit_plans for update
  using (salesperson_id = auth.uid())
  with check (salesperson_id = auth.uid()
              and status in ('taslak','gonderildi')
              and approved_by is null and decided_at is null);
-- Items editable only while the plan is a draft.
drop policy if exists vplan_items_write on visit_plan_items;
create policy vplan_items_write on visit_plan_items for all
  using (exists (select 1 from visit_plans p
                 where p.id = visit_plan_items.plan_id
                   and p.salesperson_id = auth.uid() and p.status = 'taslak'))
  with check (exists (select 1 from visit_plans p
                      where p.id = visit_plan_items.plan_id
                        and p.salesperson_id = auth.uid() and p.status = 'taslak'));

create or replace function decide_visit_plan(p_plan_id uuid, p_decision plan_status, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status plan_status;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null or not is_manager() then raise exception 'Yetkisiz'; end if;
  if p_decision not in ('onaylandi','reddedildi') then raise exception 'Geçersiz karar'; end if;
  select status into v_status from visit_plans where id = p_plan_id for update;
  if v_status is null then raise exception 'Plan bulunamadı'; end if;
  if v_status = 'taslak' then raise exception 'Gönderilmemiş plan karara bağlanamaz'; end if;
  if p_decision = 'reddedildi' and coalesce(trim(p_note), '') = '' then
    raise exception 'Ret için açıklama zorunludur';
  end if;
  update visit_plans
     set status = p_decision, approved_by = v_uid, decided_at = now(),
         manager_note = nullif(trim(coalesce(p_note,'')), ''), updated_at = now()
   where id = p_plan_id;
end;
$$;

-- ────── 0023_documents.sql ──────
-- ============================================================================
-- Photo attachments index. Bytes live in the private Storage bucket
-- "field-photos" (created via the Storage API, not SQL — the migration role
-- does not own storage.objects); this table is the app-side index.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'photo' check (kind in ('photo')),
  storage_path text not null unique,
  mime         text not null check (mime in ('image/jpeg','image/png','image/webp')),
  size_bytes   int,
  company_id   uuid references companies(id),
  ref_table    text not null check (ref_table in ('visit','complaint','competitor_observation','stock_count')),
  ref_id       uuid not null,
  uploaded_by  uuid not null references profiles(id),
  uploaded_at  timestamptz not null default now()
);
create index if not exists idx_documents_ref on documents(ref_table, ref_id);
create index if not exists idx_documents_company on documents(company_id);
alter table documents enable row level security;
drop policy if exists documents_select on documents;
create policy documents_select on documents for select
  using (uploaded_by = auth.uid() or is_manager());
drop policy if exists documents_insert_own on documents;
create policy documents_insert_own on documents for insert
  with check (uploaded_by = auth.uid());
drop policy if exists documents_delete on documents;
create policy documents_delete on documents for delete
  using (uploaded_by = auth.uid() or is_manager());

-- ────── 0024_surveys.sql ──────
-- ============================================================================
-- Özel raporlar (surveys): management publishes targeted questionnaires,
-- reps answer them per company (once per day unless allow_repeat).
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists surveys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  status        text not null default 'taslak' check (status in ('taslak','aktif','kapandi')),
  valid_from    date,
  valid_to      date,
  target_kinds  company_kind[],     -- null = all kinds
  target_plates text[],             -- null = all plates
  target_reps   uuid[],             -- null = all reps
  allow_repeat  boolean not null default false,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table if not exists survey_questions (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references surveys(id) on delete cascade,
  sort_order  int not null default 0,
  prompt      text not null,
  input_type  text not null check (input_type in ('boolean','select','number','text','scale')),
  options     jsonb,                -- select: [{"value","label"}]  scale: {"min","max"}
  is_required boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_survey_questions_survey on survey_questions(survey_id, sort_order);
create table if not exists survey_answers (
  id             uuid primary key default gen_random_uuid(),
  survey_id      uuid not null references surveys(id) on delete cascade,
  company_id     uuid not null references companies(id),
  visit_id       uuid references visits(id) on delete set null,
  salesperson_id uuid not null references profiles(id),
  answered_at    date not null default current_date,
  answers        jsonb not null default '{}'::jsonb,   -- {question_id: value}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (survey_id, company_id, salesperson_id, answered_at)
);
create index if not exists idx_survey_answers_survey on survey_answers(survey_id, company_id);
create index if not exists idx_survey_answers_sp on survey_answers(salesperson_id);

alter table surveys          enable row level security;
alter table survey_questions enable row level security;
alter table survey_answers   enable row level security;

drop policy if exists surveys_manager_all on surveys;
create policy surveys_manager_all on surveys for all using (is_manager()) with check (is_manager());
drop policy if exists surveys_select_active on surveys;
create policy surveys_select_active on surveys for select
  using (status = 'aktif'
         and (valid_from is null or valid_from <= current_date)
         and (valid_to   is null or valid_to   >= current_date)
         and (target_reps is null or auth.uid() = any(target_reps)));
drop policy if exists survey_questions_manager_all on survey_questions;
create policy survey_questions_manager_all on survey_questions for all using (is_manager()) with check (is_manager());
drop policy if exists survey_questions_select on survey_questions;
create policy survey_questions_select on survey_questions for select
  using (exists (select 1 from surveys s where s.id = survey_questions.survey_id));
drop policy if exists survey_answers_manager_all on survey_answers;
create policy survey_answers_manager_all on survey_answers for all using (is_manager()) with check (is_manager());
drop policy if exists survey_answers_own on survey_answers;
create policy survey_answers_own on survey_answers for all
  using (salesperson_id = auth.uid()) with check (salesperson_id = auth.uid());

-- ────── 0025_stock_counts.sql ──────
-- ============================================================================
-- Stock counts (palet sayımı) at dealers. The admin picks which SKUs appear in
-- the count (skus.in_stock_count). Only distributors may have counts.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists skus (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  name_tr        text not null,
  category_id    uuid references product_categories(id),
  units_per_box  int,
  in_stock_count boolean not null default true,
  is_active      boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);
create table if not exists stock_counts (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id),
  visit_id       uuid references visits(id) on delete set null,
  salesperson_id uuid not null references profiles(id),
  counted_at     date not null default current_date,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_stock_counts_company on stock_counts(company_id, counted_at desc);
create index if not exists idx_stock_counts_sp on stock_counts(salesperson_id);
create table if not exists stock_count_lines (
  id             uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references stock_counts(id) on delete cascade,
  sku_id         uuid not null references skus(id),
  pallets        numeric(6,1) not null default 0 check (pallets >= 0),
  unique (stock_count_id, sku_id)
);

-- security definer: the assert must not depend on the caller's company visibility.
create or replace function assert_stock_count_distributor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from companies c where c.id = new.company_id and c.kind = 'distributor') then
    raise exception 'Stok sayımı yalnızca bayi/distribütör için girilebilir';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_stock_counts_distributor on stock_counts;
create trigger trg_stock_counts_distributor
  before insert or update of company_id on stock_counts
  for each row execute function assert_stock_count_distributor();

-- Atomic line replace (same pattern as replace_visit_answers; RLS applies).
create or replace function replace_stock_count_lines(p_stock_count_id uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  delete from stock_count_lines where stock_count_id = p_stock_count_id;
  insert into stock_count_lines (stock_count_id, sku_id, pallets)
  select p_stock_count_id, (r->>'sku_id')::uuid, coalesce((nullif(r->>'pallets',''))::numeric, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end;
$$;

alter table skus              enable row level security;
alter table stock_counts      enable row level security;
alter table stock_count_lines enable row level security;
drop policy if exists skus_select on skus;
create policy skus_select on skus for select using (true);
drop policy if exists skus_admin_write on skus;
create policy skus_admin_write on skus for all using (is_admin()) with check (is_admin());
drop policy if exists stock_counts_manager_all on stock_counts;
create policy stock_counts_manager_all on stock_counts for all using (is_manager()) with check (is_manager());
drop policy if exists stock_counts_own on stock_counts;
create policy stock_counts_own on stock_counts for all
  using (salesperson_id = auth.uid())
  with check (salesperson_id = auth.uid()
              and exists (select 1 from assignments a
                          where a.company_id = stock_counts.company_id and a.salesperson_id = auth.uid()));
drop policy if exists stock_count_lines_rw on stock_count_lines;
create policy stock_count_lines_rw on stock_count_lines for all
  using (exists (select 1 from stock_counts s where s.id = stock_count_lines.stock_count_id
                 and (s.salesperson_id = auth.uid() or is_manager())))
  with check (exists (select 1 from stock_counts s where s.id = stock_count_lines.stock_count_id
                      and (s.salesperson_id = auth.uid() or is_manager())));

-- ────── 0026_dealer_targets.sql ──────
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

-- ────── 0027_competitor_products.sql ──────
-- ============================================================================
-- Competitor product catalog: chips in the rakip form; free-text products get a
-- "serbest" badge and can be mapped to the catalog by the office.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists competitor_products (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  category_id   uuid references product_categories(id),
  name          text not null,
  is_active     boolean not null default true,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create unique index if not exists uq_competitor_products_name on competitor_products(competitor_id, lower(name));
alter table competitor_observations add column if not exists competitor_product_id uuid references competitor_products(id);
create index if not exists idx_compobs_product on competitor_observations(competitor_product_id);
alter table competitor_products enable row level security;
drop policy if exists competitor_products_select on competitor_products;
create policy competitor_products_select on competitor_products for select using (true);
drop policy if exists competitor_products_insert_auth on competitor_products;
create policy competitor_products_insert_auth on competitor_products for insert with check (auth.uid() is not null);
drop policy if exists competitor_products_admin_write on competitor_products;
create policy competitor_products_admin_write on competitor_products for all using (is_admin()) with check (is_admin());

-- ────── 0028_question_tweaks.sql ──────
-- ============================================================================
-- Question catalog adjustments for the new company kinds and the removal of
-- the order step from the wizard.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
-- "Hizmet veren bayi" now applies to prospects and sub-dealers (guarded once so
-- a later admin choice survives replays).
do $$ begin
  if not exists (select 1 from app_settings where key = 'hiz_veren_bayi_kinds_v1') then
    update questions set applies_to_kind = array['non_customer','sub_dealer']::company_kind[]
     where code = 'hiz_veren_bayi';
    insert into app_settings (key, value) values ('hiz_veren_bayi_kinds_v1', 'true'::jsonb)
    on conflict (key) do nothing;
  end if;
end $$;
-- The order step is gone; its questions become plain optional extras (guarded once
-- so a later admin choice survives replays).
do $$ begin
  if not exists (select 1 from app_settings where key = 'order_questions_optional_v1') then
    update questions set is_required = false where code in ('siparis_alindi','siparis_alinmama_nedeni');
    insert into app_settings (key, value) values ('order_questions_optional_v1', 'true'::jsonb)
    on conflict (key) do nothing;
  end if;
end $$;

-- ────── 0029_review_hardening.sql ──────
-- ============================================================================
-- Hardening after review: field registration replay, rep-editable company
-- columns, survey answer eligibility, document ownership, plan notes,
-- competitor product attribution, archived dealers in stock counts.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================

-- 1) register_company_from_field: the p_id replay path may only reuse a row of
--    the same (field-registrable) kind that this rep created; a stale name
--    match must be alive and of the requested kind.
create or replace function register_company_from_field(
  p_kind                 company_kind,
  p_name                 text,
  p_city                 text default null,
  p_plate_code           text default null,
  p_phone                text default null,
  p_buys_from_company_id uuid default null,
  p_notes                text default null,
  p_id                   uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_id    uuid;
  v_name  text := trim(coalesce(p_name, ''));
  v_plate text := nullif(trim(coalesce(p_plate_code, '')), '');
begin
  if v_uid is null then raise exception 'Yetkisiz'; end if;
  if p_kind not in ('non_customer','sub_dealer','competitor_point') then
    raise exception 'Bu firma türü sahadan kaydedilemez';
  end if;
  if v_name = '' then raise exception 'Firma adı zorunludur'; end if;
  if v_plate is not null and v_plate !~ '^[0-9]{2}$' then
    raise exception 'Plaka kodu 2 haneli olmalı';
  end if;
  if p_buys_from_company_id is not null and not exists (
    select 1 from companies where id = p_buys_from_company_id
      and kind = 'distributor' and deleted_at is null) then
    raise exception 'Hizmet veren bayi bulunamadı';
  end if;

  if p_id is not null then
    -- Replayed op: only this rep's own field-registered row may be reused.
    select id into v_id from companies
     where id = p_id and deleted_at is null and created_by = v_uid
       and kind in ('non_customer','sub_dealer','competitor_point');
    if v_id is null and exists (select 1 from companies where id = p_id) then
      raise exception 'Bu kayıt yeniden kullanılamaz';
    end if;
  end if;
  if v_id is null then
    select id into v_id from companies
     where kind = p_kind and deleted_at is null and lower(name) = lower(v_name)
     limit 1;                                                    -- duplicate name
  end if;
  if v_id is null then
    insert into companies (id, kind, name, city, plate_code, phone,
                           buys_from_company_id, notes, created_by)
    values (coalesce(p_id, gen_random_uuid()), p_kind, v_name,
            nullif(trim(coalesce(p_city,'')), ''), v_plate,
            nullif(trim(coalesce(p_phone,'')), ''), p_buys_from_company_id,
            nullif(trim(coalesce(p_notes,'')), ''), v_uid)
    returning id into v_id;
  end if;

  insert into assignments (company_id, salesperson_id, role)
  values (v_id, v_uid,
          case when exists (select 1 from assignments where company_id = v_id and role = 'owner')
               then 'backup' else 'owner' end)
  on conflict (company_id, salesperson_id) do nothing;
  return v_id;
end;
$$;

-- 2) Non-managers may only change contact-level columns of companies they
--    registered; identity columns (kind, logo_code, segment, debt_status,
--    deleted_at, created_by) are frozen. buys_from must point at a live dealer.
create or replace function guard_company_field_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.buys_from_company_id is not null and (
       new.buys_from_company_id = new.id
       or not exists (select 1 from companies c where c.id = new.buys_from_company_id
                        and c.kind = 'distributor' and c.deleted_at is null)) then
    raise exception 'Hizmet veren bayi geçersiz';
  end if;
  -- Service-role / migration writes carry no auth.uid(); managers pass too.
  if auth.uid() is null or is_manager() then return new; end if;
  if new.kind is distinct from old.kind
     or new.logo_code is distinct from old.logo_code
     or new.segment is distinct from old.segment
     or new.debt_status is distinct from old.debt_status
     or new.deleted_at is distinct from old.deleted_at
     or new.created_by is distinct from old.created_by then
    raise exception 'Bu alanları yalnızca yönetim değiştirebilir';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_companies_guard_field_update on companies;
create trigger trg_companies_guard_field_update
  before update on companies
  for each row execute function guard_company_field_update();

-- 3) survey_answers: a rep may only answer a survey they can see (RLS on
--    surveys = active + window + targeted) and, for dealers, one they are
--    assigned to.
drop policy if exists survey_answers_own on survey_answers;
create policy survey_answers_own on survey_answers for all
  using (salesperson_id = auth.uid())
  with check (
    salesperson_id = auth.uid()
    and exists (select 1 from surveys s where s.id = survey_answers.survey_id)
    and exists (select 1 from companies c where c.id = survey_answers.company_id
                  and c.deleted_at is null
                  and (c.kind <> 'distributor'
                       or exists (select 1 from assignments a
                                   where a.company_id = c.id and a.salesperson_id = auth.uid())))
  );

-- 4) documents: the referenced record must belong to the uploader (or the
--    uploader is a manager). Checked in a definer trigger so it does not
--    depend on the caller's visibility of the target table.
create or replace function assert_document_ref_owner()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean := false;
begin
  if v_uid is null or is_manager() then return new; end if;
  if new.ref_table = 'visit' then
    select exists (select 1 from visits where id = new.ref_id and salesperson_id = v_uid) into v_ok;
  elsif new.ref_table = 'complaint' then
    select exists (select 1 from complaints where id = new.ref_id and reported_by = v_uid) into v_ok;
  elsif new.ref_table = 'competitor_observation' then
    select exists (select 1 from competitor_observations where id = new.ref_id and salesperson_id = v_uid) into v_ok;
  elsif new.ref_table = 'stock_count' then
    select exists (select 1 from stock_counts where id = new.ref_id and salesperson_id = v_uid) into v_ok;
  end if;
  if not v_ok then raise exception 'Bu kayda fotoğraf ekleme yetkiniz yok'; end if;
  return new;
end;
$$;
drop trigger if exists trg_documents_ref_owner on documents;
create trigger trg_documents_ref_owner
  before insert on documents
  for each row execute function assert_document_ref_owner();

-- 5) visit_plans: reps cannot write manager_note; decided plans cannot be deleted.
create or replace function guard_plan_manager_note()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_manager() then
    new.manager_note := old.manager_note;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_visit_plans_manager_note on visit_plans;
create trigger trg_visit_plans_manager_note
  before update on visit_plans
  for each row execute function guard_plan_manager_note();
drop policy if exists visit_plans_delete_own on visit_plans;
create policy visit_plans_delete_own on visit_plans for delete
  using (salesperson_id = auth.uid() and status in ('taslak','gonderildi'));

-- 6) competitor_products: field inserts are attributed to the caller and active.
drop policy if exists competitor_products_insert_auth on competitor_products;
create policy competitor_products_insert_auth on competitor_products for insert
  with check (auth.uid() is not null and created_by = auth.uid() and is_active);

-- 7) Stock counts only for live dealers.
create or replace function assert_stock_count_distributor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from companies c where c.id = new.company_id
                   and c.kind = 'distributor' and c.deleted_at is null) then
    raise exception 'Stok sayımı yalnızca bayi/distribütör için girilebilir';
  end if;
  return new;
end;
$$;

-- 8) allow_repeat=false is enforced across reps (RLS hides colleagues' rows).
create or replace function survey_answered_by_anyone(p_survey_id uuid, p_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from survey_answers
                  where survey_id = p_survey_id and company_id = p_company_id)
$$;
create or replace function assert_survey_repeat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from surveys s where s.id = new.survey_id and s.allow_repeat = false)
     and exists (select 1 from survey_answers a
                  where a.survey_id = new.survey_id and a.company_id = new.company_id
                    and a.id <> new.id) then
    raise exception 'Bu rapor bu firma için zaten dolduruldu';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_survey_answers_repeat on survey_answers;
create trigger trg_survey_answers_repeat
  before insert on survey_answers
  for each row execute function assert_survey_repeat();

-- 9) Reps see every stock count of a dealer they are assigned to (not only
--    their own), so "son sayım" hints and the Stok tab are complete.
drop policy if exists stock_counts_select_assigned on stock_counts;
create policy stock_counts_select_assigned on stock_counts for select
  using (exists (select 1 from assignments a
                 where a.company_id = stock_counts.company_id and a.salesperson_id = auth.uid()));
drop policy if exists stock_count_lines_select_assigned on stock_count_lines;
create policy stock_count_lines_select_assigned on stock_count_lines for select
  using (exists (select 1 from stock_counts s join assignments a on a.company_id = s.company_id
                 where s.id = stock_count_lines.stock_count_id and a.salesperson_id = auth.uid()));
`;
