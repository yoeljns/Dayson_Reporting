-- ============================================================================
-- Merge only the PU-family mastics (PU, Extra PU, Tixo) into a single
-- "PU mastik" category. Bands (Maskeleme Bandı) and sandpapers (Soft,
-- Cırt Zımpara, Su/Kuru) STAY active. Guarded once via
-- app_settings.catalog_pu_only_v1. Idempotent — also in PATCH_SQL.
-- ============================================================================
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_pu_only_v1') then
    update product_categories set is_active = false where code in ('extra_pu', 'tixo');
    update product_categories set is_active = true, label_tr = 'PU mastik' where code = 'pu';
    insert into app_settings (key, value)
      values ('catalog_pu_only_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;
