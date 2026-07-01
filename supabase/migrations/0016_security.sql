-- ============================================================================
-- Security hardening. Idempotent — also bundled into PATCH_SQL.
--
-- (1) handle_new_user: stop reading the role from raw_user_meta_data. That
--     value is client-controlled at signup, so a public anon-key signUp() call
--     with options.data.role='admin' could mint an admin profile. Every trusted
--     flow (createUser / inviteUser / createFirstAdmin) already sets the real
--     role via a profiles UPDATE right after creating the auth user, so
--     hardcoding 'salesperson' here breaks nothing.
--     ALSO: disable public signups in Supabase Auth settings (dashboard).
--
-- (2) update_complaint_status: SECURITY DEFINER bypasses RLS, so the function
--     body must authorize. Require manager OR reporter/assignee, reject drafts,
--     and allow a manager-only reopen (cozuldu/iptal -> islemde) so closed
--     complaints are no longer permanent dead ends.
-- ============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.email, ''),
    'salesperson'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function update_complaint_status(
  p_complaint_id uuid,
  p_to_status    complaint_status,
  p_note         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from     complaint_status;
  v_reporter uuid;
  v_assignee uuid;
  v_is_draft boolean;
  v_uid      uuid := auth.uid();
  v_manager  boolean;
begin
  if v_uid is null then
    raise exception 'Yetkisiz';
  end if;

  select status, reported_by, assignee_id, is_draft
    into v_from, v_reporter, v_assignee, v_is_draft
    from complaints where id = p_complaint_id for update;
  if v_from is null then
    raise exception 'Şikayet bulunamadı';
  end if;

  v_manager := is_manager();
  if not (v_manager or v_reporter = v_uid or v_assignee = v_uid) then
    raise exception 'Bu şikayet üzerinde yetkiniz yok';
  end if;

  if v_is_draft then
    raise exception 'Taslak şikayetin durumu değiştirilemez';
  end if;

  -- Validate the workflow transition (managers may also reopen closed ones).
  if not (
    (v_from = 'acik'    and p_to_status in ('islemde','iptal')) or
    (v_from = 'islemde' and p_to_status in ('cozuldu','iptal')) or
    (v_manager and v_from in ('cozuldu','iptal') and p_to_status = 'islemde')
  ) then
    raise exception 'Geçersiz durum geçişi: % -> %', v_from, p_to_status;
  end if;

  if coalesce(trim(p_note), '') = '' then
    raise exception 'Durum değişikliği için açıklama (not) zorunludur';
  end if;

  update complaints
     set status = p_to_status,
         resolved_at = case
           when p_to_status = 'cozuldu' then now()
           when v_from in ('cozuldu','iptal') then null
           else resolved_at
         end,
         updated_at = now()
   where id = p_complaint_id;

  insert into complaint_events (complaint_id, actor_id, from_status, to_status, note)
  values (p_complaint_id, v_uid, v_from, p_to_status, p_note);
end;
$$;
