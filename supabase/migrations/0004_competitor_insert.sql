-- ============================================================================
-- Let salespeople add competitors on the fly from the field, and remove the
-- placeholder "Rakip A/B/C" seed rows (only if unused).
-- Idempotent — applied on every boot by the runtime bootstrap.
-- ============================================================================

drop policy if exists competitors_insert_auth on competitors;
create policy competitors_insert_auth on competitors for insert
  with check (auth.uid() is not null);

delete from competitors c
 where c.name in ('Rakip A', 'Rakip B', 'Rakip C')
   and not exists (
     select 1 from competitor_observations o where o.competitor_id = c.id
   );
