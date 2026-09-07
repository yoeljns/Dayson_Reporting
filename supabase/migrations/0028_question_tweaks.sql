-- ============================================================================
-- Question catalog adjustments for the new company kinds and the removal of
-- the order step from the wizard.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
-- "Hizmet veren bayi" now applies to prospects and sub-dealers.
update questions set applies_to_kind = array['non_customer','sub_dealer']::company_kind[]
 where code = 'hiz_veren_bayi';
-- The order step is gone; its questions become plain optional extras (guarded once
-- so a later admin choice survives replays).
do $$ begin
  if not exists (select 1 from app_settings where key = 'order_questions_optional_v1') then
    update questions set is_required = false where code in ('siparis_alindi','siparis_alinmama_nedeni');
    insert into app_settings (key, value) values ('order_questions_optional_v1', 'true'::jsonb)
    on conflict (key) do nothing;
  end if;
end $$;
