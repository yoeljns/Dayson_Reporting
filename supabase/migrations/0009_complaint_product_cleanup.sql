-- ============================================================================
-- Complaint → product link + one-time catalog cleanup.
-- Idempotent — also bundled into PATCH_SQL.
-- ============================================================================

alter table complaints add column if not exists product_category_id uuid references product_categories(id);

update questions set label_tr = 'Sonraki ziyaret tarihi (opsiyonel)'
 where code = 'sonraki_ziyaret_tarihi' and label_tr = 'Sonraki ziyaret tarihi';

-- One-time cleanup (guarded so it never overrides later admin choices): hide the
-- satisfaction + contact-role questions and deactivate the removed brands.
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_cleanup_v1') then
    update questions set is_active = false
      where code in ('genel_memnuniyet', 'gorusulen_kisi_rolu');
    update product_brands set is_active = false
      where lower(name) = any (array[
        'den braven','penosil','3m','beorol','alfa bant','rulopak',
        'bison','pattex','kovax','klingspor','deerfos','starcke']);
    insert into app_settings (key, value)
      values ('catalog_cleanup_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;
