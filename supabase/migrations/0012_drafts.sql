-- ============================================================================
-- Drafts for complaints and competitor observations. A "Taslak kaydet" button
-- saves an incomplete record; it can be resumed and finalized later. Drafts are
-- private to the reporter and excluded from manager queues + reports.
-- Idempotent — also bundled into PATCH_SQL.
-- ============================================================================

alter table complaints              add column if not exists is_draft boolean not null default false;
alter table competitor_observations add column if not exists is_draft boolean not null default false;

-- Reporters may finalize/edit their OWN draft complaints. Once is_draft flips to
-- false the USING clause no longer matches, so a finalized complaint can only be
-- changed by a manager (or the status RPC) — same as before.
drop policy if exists complaints_update_own_draft on complaints;
create policy complaints_update_own_draft on complaints for update
  using (reported_by = auth.uid() and is_draft)
  with check (reported_by = auth.uid());
