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
