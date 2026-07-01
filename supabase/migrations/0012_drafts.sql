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
-- changed by a manager (or the status RPC) — same as before. The WITH CHECK pins
-- the workflow columns to safe defaults so finalization only flips is_draft and
-- cannot forge a resolved/assigned state or bypass update_complaint_status.
drop policy if exists complaints_update_own_draft on complaints;
create policy complaints_update_own_draft on complaints for update
  using (reported_by = auth.uid() and is_draft)
  with check (
    reported_by = auth.uid()
    and status = 'acik'
    and assignee_id is null
    and resolved_at is null
  );

-- Reporters may write the single opening event ('acik') on their OWN complaint
-- (used when a complaint is finalized). All other events go through the RPC.
drop policy if exists cevents_insert_reporter on complaint_events;
create policy cevents_insert_reporter on complaint_events for insert
  with check (
    actor_id = auth.uid()
    and to_status = 'acik'
    and from_status is null
    and exists (
      select 1 from complaints c
      where c.id = complaint_events.complaint_id and c.reported_by = auth.uid()
    )
  );
