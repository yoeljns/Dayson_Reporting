-- ============================================================================
-- Product matrix restructure: PU, Extra PU, Tixo, single Maskeleme Bandı (with
-- our 6 tape types as options), Soft, Cırt, Su/Kuru. The length-based masking
-- categories and Sosis / Koli Bandı / Korniş are retired.
-- Idempotent — also bundled into PATCH_SQL.
-- ============================================================================

insert into product_categories (code, label_tr, sort_order) values
  ('extra_pu',  'Extra PU',        15),
  ('tixo',      'Tixo',            18),
  ('maskeleme', 'Maskeleme Bandı', 30)
on conflict (code) do nothing;

insert into product_brands (name) values
  ('UNI Beyaz'),('UNI Sarı'),('Kahve Extra'),
  ('Beyaz Extra'),('Beyaz Klasik'),('Sarı Klasik')
on conflict (lower(name)) do nothing;

insert into product_category_brands (category_id, brand_id, is_own, sort_order)
select c.id, b.id, v.is_own, v.sort_order
from (values
  ('maskeleme','UNI Beyaz',true,1),('maskeleme','UNI Sarı',true,2),('maskeleme','Kahve Extra',true,3),
  ('maskeleme','Beyaz Extra',true,4),('maskeleme','Beyaz Klasik',true,5),('maskeleme','Sarı Klasik',true,6),
  ('maskeleme','VEGE',false,7),('maskeleme','Tesa',false,8),('maskeleme','Hasbant',false,9),('maskeleme','Nora Bant',false,10),
  ('extra_pu','Dayson',true,1),('extra_pu','Selsil',false,2),('extra_pu','Soudal',false,3),
  ('extra_pu','Akfix',false,4),('extra_pu','Somafix',false,5),('extra_pu','Akkim',false,6),
  ('tixo','Dayson',true,1)
) as v(cat_code, brand_name, is_own, sort_order)
join product_categories c on c.code = v.cat_code
join product_brands b on lower(b.name) = lower(v.brand_name)
on conflict do nothing;

-- Retire the old categories (guarded once so admin choices aren't overridden).
do $$ begin
  if not exists (select 1 from app_settings where key = 'catalog_restructure_v1') then
    update product_categories set is_active = false
      where code in ('sos','koli_bant','kornis','b35','b30','h25');
    insert into app_settings (key, value)
      values ('catalog_restructure_v1', 'true'::jsonb) on conflict (key) do nothing;
  end if;
end $$;
