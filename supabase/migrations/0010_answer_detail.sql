-- ============================================================================
-- Free-text detail for "Diğer" answers + relabel a sonraki_aksiyon option.
-- Idempotent — also bundled into PATCH_SQL.
-- ============================================================================

-- Detail text captured when a select answer is "diger" (Diğer).
alter table visit_answers add column if not exists value_detail text;

-- "Aksiyon yok" → "Takip" (keep the value 'aksiyon_yok' so past answers survive).
update question_options o set label_tr = 'Takip'
from questions q
where o.question_id = q.id and q.code = 'sonraki_aksiyon'
  and o.value = 'aksiyon_yok' and o.label_tr = 'Aksiyon yok';
