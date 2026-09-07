-- ============================================================================
-- Photo attachments index. Bytes live in the private Storage bucket
-- "field-photos" (created via the Storage API, not SQL — the migration role
-- does not own storage.objects); this table is the app-side index.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'photo' check (kind in ('photo')),
  storage_path text not null unique,
  mime         text not null check (mime in ('image/jpeg','image/png','image/webp')),
  size_bytes   int,
  company_id   uuid references companies(id),
  ref_table    text not null check (ref_table in ('visit','complaint','competitor_observation','stock_count')),
  ref_id       uuid not null,
  uploaded_by  uuid not null references profiles(id),
  uploaded_at  timestamptz not null default now()
);
create index if not exists idx_documents_ref on documents(ref_table, ref_id);
create index if not exists idx_documents_company on documents(company_id);
alter table documents enable row level security;
drop policy if exists documents_select on documents;
create policy documents_select on documents for select
  using (uploaded_by = auth.uid() or is_manager());
drop policy if exists documents_insert_own on documents;
create policy documents_insert_own on documents for insert
  with check (uploaded_by = auth.uid());
drop policy if exists documents_delete on documents;
create policy documents_delete on documents for delete
  using (uploaded_by = auth.uid() or is_manager());
