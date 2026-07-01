-- ============================================================================
-- Atomic replace of a visit's answers. saveVisit previously deleted all
-- visit_answers rows and re-inserted them as two separate PostgREST calls; a
-- failed insert (constraint violation, transient error) permanently wiped the
-- visit's saved answers. Single-transaction RPC — same pattern as
-- replace_visit_products. SECURITY INVOKER, so RLS still limits reps to their
-- own visits. Idempotent — also bundled into PATCH_SQL.
-- ============================================================================
create or replace function replace_visit_answers(p_visit_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from visit_answers where visit_id = p_visit_id;
  insert into visit_answers (visit_id, question_id, value_text, value_number, value_date, value_detail)
  select p_visit_id,
         (r->>'question_id')::uuid,
         nullif(r->>'value_text', ''),
         (nullif(r->>'value_number', ''))::numeric,
         (nullif(r->>'value_date', ''))::date,
         nullif(r->>'value_detail', '')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end;
$$;
