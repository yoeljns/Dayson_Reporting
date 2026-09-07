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
