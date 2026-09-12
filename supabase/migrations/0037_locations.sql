-- ============================================================================
-- Locations: where a visit was completed (one-shot GPS fix, with the rep's
-- permission) and where a company is (learned from the first face-to-face
-- visit, editable by the office). Used for "nearby company" suggestions and
-- a distance badge on the manager's visit list.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
alter table companies add column if not exists lat double precision;
alter table companies add column if not exists lng double precision;
alter table companies add column if not exists location_source text;   -- 'first_visit' | 'manual'
alter table companies add column if not exists located_at timestamptz;
alter table visits add column if not exists lat double precision;
alter table visits add column if not exists lng double precision;
alter table visits add column if not exists accuracy_m int;
alter table visits add column if not exists located_at timestamptz;
create index if not exists idx_companies_located on companies(lat) where lat is not null;
