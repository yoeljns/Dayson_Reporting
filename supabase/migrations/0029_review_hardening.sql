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
