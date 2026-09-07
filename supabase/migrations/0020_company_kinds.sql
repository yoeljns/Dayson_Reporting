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
