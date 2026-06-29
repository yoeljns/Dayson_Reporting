-- ============================================================================
-- Patch: complaints can be raised by someone NOT registered in the system,
-- optionally linked to one of our distributors.
-- Idempotent — safe to run on every boot (handled by the runtime bootstrap).
-- ============================================================================

alter table complaints add column if not exists complainant_name  text;
alter table complaints add column if not exists complainant_phone text;

-- The distributor link is optional now (the complainant may be external).
alter table complaints alter column company_id drop not null;
