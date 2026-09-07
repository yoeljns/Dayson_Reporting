-- ============================================================================
-- PRE phase (runs alone, in its own transaction — see bootstrap.ts).
-- New company kind "other" (Diğer): everything that is neither a dealer nor a
-- prospect. Nothing else may live in this file.
-- ============================================================================
select pg_advisory_xact_lock(872764184);
alter type company_kind add value if not exists 'other';
