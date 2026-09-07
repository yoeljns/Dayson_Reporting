-- ============================================================================
-- Enum additions ONLY. This file is bundled into PATCH_PRE_SQL and applied in
-- its own transaction BEFORE the rest of the patches, because Postgres refuses
-- to use a new enum value inside the transaction that added it. Anything that
-- references these values lives in 0020+.
--
-- Applying by hand (SQL editor): run this file on its own first.
-- ============================================================================
select pg_advisory_xact_lock(872764184);

-- plan_status is created by 0006 (a PATCH file). On a fresh install this file
-- runs before it, so create the type here; 0006's guarded create then no-ops.
do $$ begin
  create type plan_status as enum ('taslak','gonderildi');
exception when duplicate_object then null; end $$;

alter type company_kind add value if not exists 'sub_dealer';
alter type company_kind add value if not exists 'competitor_point';
alter type plan_status  add value if not exists 'onaylandi';
alter type plan_status  add value if not exists 'reddedildi';
