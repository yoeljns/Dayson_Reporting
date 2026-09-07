-- ============================================================================
-- Several salespeople per company: one owner (Sorumlu) + any number of
-- backups (Yedek). Managers manage assignments through RLS as well.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
alter table assignments add column if not exists role text not null default 'owner';
do $$ begin
  alter table assignments add constraint assignments_role_chk check (role in ('owner','backup'));
exception when duplicate_object then null; end $$;
-- Exactly one owner per company (oldest row keeps it). Idempotent.
update assignments a set role = 'backup'
 where a.role = 'owner'
   and exists (select 1 from assignments b
               where b.company_id = a.company_id and b.role = 'owner'
                 and (b.created_at, b.id) < (a.created_at, a.id));
create unique index if not exists uq_assignments_owner on assignments(company_id) where role = 'owner';
drop policy if exists assignments_manager_write on assignments;
create policy assignments_manager_write on assignments for all
  using (is_manager()) with check (is_manager());
