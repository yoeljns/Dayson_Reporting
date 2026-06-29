-- ============================================================================
-- Seed: standard visit question catalog (admin-editable later) + competitors.
-- All answers are select/enum/boolean so they stay analyzable. One free-text
-- "serbest_not" field is the single exception.
-- Idempotent: safe to re-run (on conflict do nothing).
-- ============================================================================

insert into questions (code, label_tr, input_type, applies_to, is_required, sort_order) values
  ('siparis_alindi',          'Sipariş alındı mı?',              'boolean', null, true,  10),
  ('siparis_alinmama_nedeni', 'Sipariş alınmadıysa neden?',      'select',  null, false, 20),
  ('ziyaret_amaci',           'Ziyaret amacı',                   'select',  null, true,  30),
  ('gorusulen_kisi_rolu',     'Görüşülen kişi',                  'select',  null, true,  40),
  ('genel_memnuniyet',        'Genel memnuniyet (1-5)',          'select',  null, true,  50),
  ('sonraki_aksiyon',         'Sonraki aksiyon',                 'select',  null, true,  60),
  ('sonraki_ziyaret_tarihi',  'Sonraki ziyaret tarihi',          'date',    null, false, 70),
  ('serbest_not',             'Serbest not',                     'text',    null, false, 80)
on conflict (code) do nothing;

-- Options for "siparis_alinmama_nedeni"
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('fiyat',        'Fiyat',          1),
  ('stok_yok',     'Stok yok',       2),
  ('ihtiyac_yok',  'İhtiyaç yok',    3),
  ('rakip_tercih', 'Rakibi tercih',  4),
  ('diger',        'Diğer',          5)
) as v(value, label_tr, sort_order) on true
where q.code = 'siparis_alinmama_nedeni'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Options for "ziyaret_amaci"
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('satis',          'Satış',           1),
  ('tahsilat',       'Tahsilat',        2),
  ('tanitim',        'Tanıtım',         3),
  ('sikayet_takip',  'Şikayet takibi',  4),
  ('rutin_ziyaret',  'Rutin ziyaret',   5),
  ('diger',          'Diğer',           6)
) as v(value, label_tr, sort_order) on true
where q.code = 'ziyaret_amaci'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Options for "gorusulen_kisi_rolu"
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('sahip',       'Firma sahibi',  1),
  ('satin_alma',  'Satın alma',    2),
  ('depo',        'Depo',          3),
  ('muhasebe',    'Muhasebe',      4),
  ('diger',       'Diğer',         5)
) as v(value, label_tr, sort_order) on true
where q.code = 'gorusulen_kisi_rolu'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Options for "genel_memnuniyet" (1-5)
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('1', '1 - Çok kötü', 1),
  ('2', '2 - Kötü',     2),
  ('3', '3 - Orta',     3),
  ('4', '4 - İyi',      4),
  ('5', '5 - Çok iyi',  5)
) as v(value, label_tr, sort_order) on true
where q.code = 'genel_memnuniyet'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- Options for "sonraki_aksiyon"
insert into question_options (question_id, value, label_tr, sort_order)
select q.id, v.value, v.label_tr, v.sort_order
from questions q
join (values
  ('teklif_gonder',    'Teklif gönder',       1),
  ('numune_gonder',    'Numune gönder',       2),
  ('tekrar_ziyaret',   'Tekrar ziyaret',      3),
  ('tahsilat_takip',   'Tahsilat takibi',     4),
  ('aksiyon_yok',      'Aksiyon yok',         5)
) as v(value, label_tr, sort_order) on true
where q.code = 'sonraki_aksiyon'
  and not exists (select 1 from question_options o where o.question_id = q.id);

-- A couple of starter competitors (admin manages the rest).
insert into competitors (name) values
  ('Rakip A'), ('Rakip B'), ('Rakip C')
on conflict (name) do nothing;
