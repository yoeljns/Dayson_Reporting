// AUTO-GENERATED from supabase/migrations/*.sql — do not edit by hand.
// Regenerate after changing the migrations. Bundled so the runtime migrator
// (src/lib/bootstrap.ts) can apply the schema without filesystem access.

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

// Idempotent patches applied on every boot (ALTER ... IF NOT EXISTS etc.),
// so existing databases pick up additive schema changes.
export const PATCH_SQL = `-- ============================================================================
-- Patch: complaints can be raised by someone NOT registered in the system,
-- optionally linked to one of our distributors.
-- Idempotent — safe to run on every boot (handled by the runtime bootstrap).
-- ============================================================================

alter table complaints add column if not exists complainant_name  text;
alter table complaints add column if not exists complainant_phone text;

-- The distributor link is optional now (the complainant may be external).
alter table complaints alter column company_id drop not null;

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

-- ============================================================================
-- Soft-delete (archive) for visits (drafts) and companies, so "deleted" items
-- are hidden from lists but kept on record and never break linked reports.
-- Idempotent — applied on every boot by the runtime bootstrap.
-- ============================================================================

alter table visits add column if not exists deleted_at timestamptz;
alter table visits add column if not exists deleted_by uuid references profiles(id);

alter table companies add column if not exists deleted_at timestamptz;

-- ============================================================================
-- Weekly visit plans (haftalık ziyaret planı) + last-visit reporting view.
-- A salesperson plans the companies to visit in a given week, then submits it;
-- following weeks can be planned independently. company_last_visit feeds the
-- "son ziyaret tarihi" screens (security_invoker => caller's RLS applies).
-- Idempotent — applied on every boot by the runtime bootstrap.
-- ============================================================================

do $$ begin
  create type plan_status as enum ('taslak','gonderildi');
exception when duplicate_object then null; end $$;

create table if not exists visit_plans (
  id             uuid primary key default gen_random_uuid(),
  salesperson_id uuid not null references profiles(id) on delete cascade,
  week_start     date not null,
  status         plan_status not null default 'taslak',
  note           text,
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (salesperson_id, week_start)
);
create index if not exists idx_visit_plans_sp on visit_plans(salesperson_id, week_start);

create table if not exists visit_plan_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references visit_plans(id) on delete cascade,
  company_id   uuid not null references companies(id),
  planned_date date,
  visit_type   visit_type,
  note         text,
  created_at   timestamptz not null default now(),
  unique (plan_id, company_id)
);
create index if not exists idx_visit_plan_items_plan on visit_plan_items(plan_id);

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

create or replace view company_last_visit
with (security_invoker = on) as
  select company_id,
         max(visit_date) as last_visit_date,
         count(*)        as visit_count
    from visits
   where status = 'tamamlandi'
     and deleted_at is null
   group by company_id;

-- ============================================================================
-- app_settings — admin-tunable key/value config (e.g. end-of-day reminder time).
-- Everyone signed in reads; only admins write. Idempotent.
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

insert into app_settings (key, value)
values ('eod_reminder', '{"enabled": true, "hour": 18, "minute": 0}'::jsonb)
on conflict (key) do nothing;

insert into app_settings (key, value)
values ('plan_deadline', '{"enabled": true, "weekday": 0, "hour": 9, "minute": 0}'::jsonb)
on conflict (key) do nothing;

-- ============================================================================
-- Visit wizard support: remembered contacts, company-kind-scoped questions,
-- and the product/brand competition matrix. Idempotent — applied every boot.
-- ============================================================================

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

alter table visits add column if not exists contact_id uuid references company_contacts(id);
alter table questions add column if not exists applies_to_kind company_kind[];

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
create unique index if not exists uq_product_brands_name on product_brands(lower(name));

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

insert into questions (code, label_tr, input_type, applies_to, applies_to_kind, is_required, sort_order)
values ('hiz_veren_bayi', 'Hizmet veren bayi', 'text', null, array['non_customer']::company_kind[], false, 75)
on conflict (code) do nothing;

update questions set label_tr = 'Ziyaret notları'
 where code = 'serbest_not' and label_tr = 'Serbest not';

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

insert into product_brands (name) values
  ('Dayson'),('Selsil'),('Soudal'),('Akfix'),('Somafix'),('Akkim'),('Den Braven'),
  ('Penosil'),('Tytan'),('VEGE'),('3M'),('Tesa'),('Beorol'),('Hasbant'),('Nora Bant'),
  ('Alfa Bant'),('Rulopak'),('Bison'),('Pattex'),('Smirdex'),('Atlas'),('Mirka'),
  ('Kovax'),('Klingspor'),('SIA'),('Bosch'),('Indasa'),('Norton'),('Deerfos'),('Starcke')
on conflict (lower(name)) do nothing;

insert into product_category_brands (category_id, brand_id, is_own, sort_order)
select c.id, b.id, v.is_own, v.sort_order
from (values
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

-- Complaint → which product it is about (from our catalog).
alter table complaints add column if not exists product_category_id uuid references product_categories(id);

-- Mark the "next visit date" question label as optional.
update questions set label_tr = 'Sonraki ziyaret tarihi (opsiyonel)'
 where code = 'sonraki_ziyaret_tarihi' and label_tr = 'Sonraki ziyaret tarihi';

-- One-time catalog cleanup (guarded so it never overrides later admin choices):
-- hide the satisfaction + contact-role questions and deactivate the brands the
-- admin asked to remove.
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

-- Free-text detail captured when a select answer is "diger" (Diğer).
alter table visit_answers add column if not exists value_detail text;

-- "Aksiyon yok" → "Takip" (keep value 'aksiyon_yok' so past answers survive).
update question_options o set label_tr = 'Takip'
from questions q
where o.question_id = q.id and q.code = 'sonraki_aksiyon'
  and o.value = 'aksiyon_yok' and o.label_tr = 'Aksiyon yok';

-- ============================================================================
-- Product matrix restructure: PU, Extra PU, Tixo, single Maskeleme Bandı (our
-- 6 tape types as options + masking competitors), Soft, Cırt, Su/Kuru; retire
-- the length-based masking + Sosis / Koli Bandı / Korniş. Idempotent.
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

do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_restructure_v1') then
    update product_categories set is_active = false
      where code in ('sos','koli_bant','kornis','b35','b30','h25');
    insert into app_settings (key, value)
      values ('catalog_restructure_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;

-- ============================================================================
-- Drafts: complaints and competitor observations can be saved incomplete
-- ("Taslak kaydet") and finalized later. Drafts stay private to the reporter
-- and are excluded from manager queues and reports. Idempotent.
-- ============================================================================
alter table complaints              add column if not exists is_draft boolean not null default false;
alter table competitor_observations add column if not exists is_draft boolean not null default false;

-- Reporters may finalize/edit their OWN draft complaints (status changes still
-- go through the RPC; a finalized complaint is no longer editable this way).
drop policy if exists complaints_update_own_draft on complaints;
create policy complaints_update_own_draft on complaints for update
  using (reported_by = auth.uid() and is_draft)
  with check (reported_by = auth.uid());
`;
