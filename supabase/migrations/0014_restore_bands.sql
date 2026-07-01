-- ============================================================================
-- Repair migration. An earlier version of 0013 wrongly deactivated the bands
-- and sandpapers along with the PU-family merge. Restore Maskeleme Bandı, Soft,
-- Cırt Zımpara and Su/Kuru; the PU-family (Extra PU, Tixo) stays merged into the
-- single "PU mastik" category. Guarded once via catalog_pu_bands_restore_v1.
-- Idempotent — also in PATCH_SQL.
-- ============================================================================
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_pu_bands_restore_v1') then
    update product_categories set is_active = true
      where code in ('maskeleme', 'soft', 'cirt_zimp', 'su_kuru');
    insert into app_settings (key, value)
      values ('catalog_pu_bands_restore_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;
