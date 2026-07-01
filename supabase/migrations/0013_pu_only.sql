-- ============================================================================
-- Collapse the visit product matrix to a single category: PU ("PU mastik").
-- Extra PU, Tixo, Maskeleme Bandı, Soft, Cırt Zımpara, Su/Kuru (and any other
-- category) are deactivated. Guarded once via app_settings.catalog_pu_only_v1
-- so later admin choices are not overridden. Idempotent — also in PATCH_SQL.
-- ============================================================================
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_pu_only_v1') then
    update product_categories set is_active = false where code <> 'pu';
    update product_categories set is_active = true, label_tr = 'PU mastik' where code = 'pu';
    insert into app_settings (key, value)
      values ('catalog_pu_only_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;
