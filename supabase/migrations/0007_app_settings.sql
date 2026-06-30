-- ============================================================================
-- app_settings — small key/value store for admin-tunable app configuration.
-- First use: the end-of-day "tamamlanmamış raporları bitir" reminder time.
--
-- Everyone signed in may read settings (the salesperson app needs the reminder
-- time); only admins may change them.
--
-- Idempotent — also bundled into PATCH_SQL so existing deployments pick it up.
-- ============================================================================

create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table app_settings enable row level security;

drop policy if exists app_settings_select on app_settings;
create policy app_settings_select on app_settings for select
  using (auth.uid() is not null);

drop policy if exists app_settings_admin_write on app_settings;
create policy app_settings_admin_write on app_settings for all
  using (is_admin()) with check (is_admin());

-- Seed the end-of-day reminder default (18:00, on). do-nothing on conflict so
-- an admin's later change is never overwritten on boot.
insert into app_settings (key, value)
values ('eod_reminder', '{"enabled": true, "hour": 18, "minute": 0}'::jsonb)
on conflict (key) do nothing;

-- Weekly plan-submission deadline default: Monday (weekday 0) 09:00.
insert into app_settings (key, value)
values ('plan_deadline', '{"enabled": true, "weekday": 0, "hour": 9, "minute": 0}'::jsonb)
on conflict (key) do nothing;
