-- ============================================================================
-- Targets v2: quantity targets per SALES category (units follow the Logo
-- shipment export: mastik/sosis/bant → palet, zımpara → adet, rest → koli),
-- target change history, ERP customer name mapping and weekly shipments
-- imported from the "Malzeme Ekstresi" (TOPLU.xlsx) report.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================

-- 1) Sales categories (same set as the office's koli→palet converter) --------
create table if not exists sales_categories (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  label_tr    text not null,
  unit        text not null check (unit in ('palet','adet','koli')),
  monthly     boolean not null default false,   -- targets entered per month
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into sales_categories (code, label_tr, unit, monthly, sort_order) values
  ('mastik',   'PU Mastik',          'palet', true,  10),
  ('sosis',    'Sosis',              'palet', false, 20),
  ('byz_kls',  'Beyaz Klasik Bant',  'palet', false, 30),
  ('byz_ext',  'Beyaz Extra Bant',   'palet', false, 40),
  ('kah_ext',  'Kahve Extra Bant',   'palet', false, 50),
  ('sari35',   'Sarı 35 Bant',       'palet', false, 60),
  ('uni',      'Uni Bant',           'palet', false, 70),
  ('sari30',   'Sarı 30 Bant',       'palet', false, 80),
  ('kah30',    'Kahve 30 Bant',      'palet', false, 90),
  ('putur',    'Pütür',              'koli',  false, 100),
  ('sia_su',   'Sia Su Zımpara',     'adet',  false, 110),
  ('sia_kuru', 'Sia Kuru Zımpara',   'adet',  false, 120),
  ('day_kuru', 'Dayson Kuru',        'koli',  false, 130),
  ('sia_cirt', 'Sia Cırt',           'adet',  false, 140),
  ('day_cirt', 'Dayson Cırt',        'adet',  false, 150),
  ('soft',     'Soft Rulo',          'koli',  false, 160),
  ('kece',     'Keçe',               'adet',  false, 170),
  ('zim_mak',  'Zımpara Makinesi',   'adet',  false, 180),
  ('tabanca',  'Tabanca',            'koli',  false, 190)
on conflict (code) do nothing;
alter table sales_categories enable row level security;
drop policy if exists sales_categories_select on sales_categories;
create policy sales_categories_select on sales_categories for select using (auth.uid() is not null);
drop policy if exists sales_categories_manager_write on sales_categories;
create policy sales_categories_manager_write on sales_categories for all
  using (is_manager()) with check (is_manager());

-- 2) Target lines keyed by sales category; monthly breakdown as jsonb ---------
alter table dealer_target_lines alter column category_id drop not null;
alter table dealer_target_lines add column if not exists sales_category_id uuid references sales_categories(id);
alter table dealer_target_lines add column if not exists monthly_qty jsonb;  -- [12 numbers] when the category is monthly
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'dealer_target_lines' and column_name = 'target_qty' and data_type = 'integer') then
    alter table dealer_target_lines alter column target_qty type numeric(12,1);
  end if;
  if exists (select 1 from information_schema.columns
             where table_name = 'dealer_target_lines' and column_name = 'actual_qty' and data_type = 'integer') then
    alter table dealer_target_lines alter column actual_qty type numeric(12,1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dealer_target_lines_target_sales_cat_key') then
    alter table dealer_target_lines
      add constraint dealer_target_lines_target_sales_cat_key unique (target_id, sales_category_id);
  end if;
end $$;

-- 3) Change history: one snapshot per save that changed something -----------
create table if not exists dealer_target_revisions (
  id          uuid primary key default gen_random_uuid(),
  target_id   uuid not null references dealer_targets(id) on delete cascade,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references profiles(id),
  reason      text,
  before      jsonb not null default '{}'::jsonb,
  after       jsonb not null default '{}'::jsonb
);
create index if not exists idx_dtr_target on dealer_target_revisions(target_id, changed_at desc);
alter table dealer_target_revisions enable row level security;
drop policy if exists dtr_manager_all on dealer_target_revisions;
create policy dtr_manager_all on dealer_target_revisions for all using (is_manager()) with check (is_manager());
drop policy if exists dtr_select_assigned on dealer_target_revisions;
create policy dtr_select_assigned on dealer_target_revisions for select
  using (exists (select 1 from dealer_targets t join assignments a on a.company_id = t.company_id
                 where t.id = dealer_target_revisions.target_id and a.salesperson_id = auth.uid()));

-- 4) ERP customer name → company mapping memory ------------------------------
create table if not exists erp_customers (
  cari_name   text primary key,
  company_id  uuid references companies(id) on delete set null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);
alter table erp_customers enable row level security;
drop policy if exists erp_customers_manager_all on erp_customers;
create policy erp_customers_manager_all on erp_customers for all using (is_manager()) with check (is_manager());

-- 5) Shipments (one row per Logo movement line) -------------------------------
create table if not exists shipments (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid references import_batches(id) on delete set null,
  cari_name         text not null,
  company_id        uuid references companies(id) on delete set null,
  fis_no            text not null,
  fis_date          date not null,
  product_code      text not null,
  product_desc      text,
  koli              numeric(12,3) not null default 0,
  eur               numeric(14,2) not null default 0,
  sales_category_id uuid references sales_categories(id),
  qty               numeric(14,3),          -- in the category's unit (null = excluded/unmapped)
  created_at        timestamptz not null default now(),
  unique (fis_no, product_code, cari_name)
);
create index if not exists idx_shipments_company_date on shipments(company_id, fis_date);
create index if not exists idx_shipments_date on shipments(fis_date);
create index if not exists idx_shipments_cari on shipments(cari_name);
alter table shipments enable row level security;
drop policy if exists shipments_manager_all on shipments;
create policy shipments_manager_all on shipments for all using (is_manager()) with check (is_manager());
drop policy if exists shipments_select_assigned on shipments;
create policy shipments_select_assigned on shipments for select
  using (company_id is not null and exists (select 1 from assignments a
                 where a.company_id = shipments.company_id and a.salesperson_id = auth.uid()));

create or replace view shipment_month_totals with (security_invoker = true) as
  select company_id,
         sales_category_id,
         extract(year from fis_date)::int  as year,
         extract(month from fis_date)::int as month,
         sum(qty)  as qty,
         sum(eur)  as eur,
         sum(koli) as koli,
         count(*)  as line_count
  from shipments
  group by 1, 2, 3, 4;

-- 6) Koli → palet conversion rates (editable on the shipments page) ----------
insert into app_settings (key, value)
values ('koli_per_pallet', '{"extMastik":64,"tixo":72,"sosis":65,"bant":84}'::jsonb)
on conflict (key) do nothing;

-- 7) Re-classify one product's shipment lines (rates changed / mapping fix) ----
create or replace function set_shipment_qty(p_code text, p_category uuid, p_factor numeric)
returns void
language sql
security invoker
as $$
  update shipments
     set sales_category_id = p_category,
         qty = case when p_factor is null then null else round(koli * p_factor, 3) end
   where product_code = p_code;
$$;
