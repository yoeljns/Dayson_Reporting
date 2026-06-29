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

-- A couple of starter competitors (admin manages the rest).
insert into competitors (name) values
  ('Rakip A'), ('Rakip B'), ('Rakip C')
on conflict (name) do nothing;
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
`;
