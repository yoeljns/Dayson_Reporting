"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { norm } from "@/lib/voice/text";
import type { AliasKind } from "@/lib/voice/parse-tr";

const KINDS: AliasKind[] = ["brand", "competitor", "competitor_product", "category", "sku", "option"];

/** Teach the voice parser how something is said ("sista" → competitor Sista). */
export async function rememberAlias(input: {
  heard: string;
  kind: AliasKind;
  targetId: string;
  targetLabel: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const profile = await requireProfile();
  const heard = norm(input.heard);
  if (heard.length < 2 || heard.length > 60) return { error: "Söyleyiş 2–60 karakter olmalı." };
  if (!KINDS.includes(input.kind)) return { error: "Geçersiz tür." };
  if (!input.targetId) return { error: "Hedef seçin." };
  const supabase = createClient();
  const { error } = await supabase.from("voice_aliases").upsert(
    {
      heard,
      target_kind: input.kind,
      target_id: input.targetId,
      target_label: input.targetLabel.slice(0, 120),
      created_by: profile.id,
    },
    { onConflict: "heard,target_kind" }
  );
  if (error) return { error: error.message };
  return { ok: true };
}

export async function forgetAlias(input: { id: string }): Promise<{ ok?: boolean; error?: string }> {
  await requireProfile();
  const supabase = createClient();
  const { error } = await supabase.from("voice_aliases").delete().eq("id", input.id);
  if (error) return { error: error.message };
  return { ok: true };
}
