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
