-- ============================================================================
-- Voice dictionary: how a brand / competitor / product / category is SAID in
-- the field ("sista" → competitor Sista, "day son" → brand Dayson). The
-- rule-based transcript parser checks these before fuzzy matching, so the
-- office (or a rep, from the review screen) can teach it new words.
-- Idempotent — bundled into PATCH_SQL.
-- ============================================================================
create table if not exists voice_aliases (
  id           uuid primary key default gen_random_uuid(),
  heard        text not null,                 -- normalized (lowercase, ascii)
  target_kind  text not null check (target_kind in ('brand','competitor','competitor_product','category','sku','option')),
  target_id    text not null,                 -- uuid or option value
  target_label text not null,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  unique (heard, target_kind)
);
alter table voice_aliases enable row level security;
drop policy if exists voice_aliases_select on voice_aliases;
create policy voice_aliases_select on voice_aliases for select using (auth.uid() is not null);
drop policy if exists voice_aliases_insert on voice_aliases;
create policy voice_aliases_insert on voice_aliases for insert with check (auth.uid() is not null and created_by = auth.uid());
drop policy if exists voice_aliases_delete on voice_aliases;
create policy voice_aliases_delete on voice_aliases for delete using (is_manager() or created_by = auth.uid());
