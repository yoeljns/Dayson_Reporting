-- ============================================================================
-- Restore the length-based masking categories (Maskeleme Bandı 35/30/25 mt) and
-- the Korniş / High Tack category; retire the single "Maskeleme Bandı". These
-- rows were only deactivated by the earlier restructure, so flipping is_active
-- back on brings their brand links along. Guarded once via
-- app_settings.catalog_masking_split_v1. Idempotent — also in PATCH_SQL.
-- ============================================================================
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_masking_split_v1') then
    update product_categories set is_active = true
      where code in ('b35', 'b30', 'h25', 'kornis');
    update product_categories set is_active = false where code = 'maskeleme';
    insert into app_settings (key, value)
      values ('catalog_masking_split_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;
