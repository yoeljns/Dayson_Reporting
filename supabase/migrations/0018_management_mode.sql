-- 0018_management_mode.sql
-- Per-user UI preference: managers/admins run the app in "management mode"
-- (viewing + oversight) instead of the salesperson reporting screens.
-- NULL means "use the role default" (managers default to management mode),
-- so existing rows need no backfill.

alter table profiles add column if not exists management_mode boolean;

comment on column profiles.management_mode is
  'UI mode for managers/admins: true = management/viewing, false = reporting, null = role default.';
