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
