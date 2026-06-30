-- ============================================================================
-- Soft-delete (archive) for visits (drafts) and companies, so "deleted" items
-- are hidden from lists but kept on record and never break linked reports.
-- Idempotent — applied on every boot by the runtime bootstrap.
-- ============================================================================

alter table visits add column if not exists deleted_at timestamptz;
alter table visits add column if not exists deleted_by uuid references profiles(id);

alter table companies add column if not exists deleted_at timestamptz;
