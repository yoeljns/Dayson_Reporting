-- ============================================================================
-- Three company kinds in the UI: Bayi / Distribütör · Potansiyel Bayi · Diğer.
-- Existing non-dealer companies were bulk-loaded, not real prospects → they
-- become "other"; the prospect list starts empty. sub_dealer/competitor_point
-- stay as enum members (Postgres cannot drop them) but are retired.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================

-- One-shot data move (service-role connection → the companies guard trigger
-- passes because auth.uid() is null).
do $$ begin
  if not exists (select 1 from app_settings where key = 'company_kind_other_v1') then
    update companies set kind = 'other'
     where kind in ('non_customer','sub_dealer','competitor_point');
    -- Question / survey targeting arrays: retired values → other (deduplicated).
    update questions
       set applies_to_kind = (
         select array_agg(distinct k order by k)
           from unnest(array_replace(array_replace(applies_to_kind, 'sub_dealer'::company_kind, 'other'::company_kind),
                                     'competitor_point'::company_kind, 'other'::company_kind)) as k)
     where applies_to_kind is not null
       and (applies_to_kind @> array['sub_dealer']::company_kind[]
            or applies_to_kind @> array['competitor_point']::company_kind[]);
    update surveys
       set target_kinds = (
         select array_agg(distinct k order by k)
           from unnest(array_replace(array_replace(target_kinds, 'sub_dealer'::company_kind, 'other'::company_kind),
                                     'competitor_point'::company_kind, 'other'::company_kind)) as k)
     where target_kinds is not null
       and (target_kinds @> array['sub_dealer']::company_kind[]
            or target_kinds @> array['competitor_point']::company_kind[]);
    insert into app_settings (key, value) values ('company_kind_other_v1', 'true'::jsonb)
    on conflict (key) do nothing;
  end if;
end $$;

-- "Hizmet veren bayi" applies to prospects and other points (v2 guard: v1 is
-- already recorded on live databases).
do $$ begin
  if not exists (select 1 from app_settings where key = 'hiz_veren_bayi_kinds_v2') then
    update questions set applies_to_kind = array['non_customer','other']::company_kind[]
     where code = 'hiz_veren_bayi';
    insert into app_settings (key, value) values ('hiz_veren_bayi_kinds_v2', 'true'::jsonb)
    on conflict (key) do nothing;
  end if;
end $$;

-- Field registration whitelist now includes "other".
drop policy if exists companies_insert_noncustomer on companies;
create policy companies_insert_noncustomer on companies for insert
  with check (kind in ('non_customer','other','sub_dealer','competitor_point') and created_by = auth.uid());

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
  if p_kind not in ('non_customer','other') then
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
       and kind in ('non_customer','other','sub_dealer','competitor_point');
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
