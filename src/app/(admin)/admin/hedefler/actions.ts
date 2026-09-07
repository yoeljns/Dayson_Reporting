"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TARGET_STATUSES, type TargetStatus } from "@/lib/enums";

function revalidate(companyId: string, year: number) {
  revalidatePath("/admin/hedefler");
  revalidatePath(`/admin/hedefler/${companyId}/${year}`);
  revalidatePath(`/admin/bayi/${companyId}`);
  revalidatePath(`/firma/${companyId}`);
  revalidatePath("/admin");
}

/** Get or create the (draft) target row for a dealer-year. */
export async function ensureTarget(input: {
  companyId: string;
  year: number;
}): Promise<{ id?: string; error?: string }> {
  const profile = await requireManager();
  if (!Number.isInteger(input.year) || input.year < 2020 || input.year > 2100)
    return { error: "Geçersiz yıl." };
  const supabase = createClient();
  const { data: ex } = await supabase
    .from("dealer_targets")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("year", input.year)
    .maybeSingle();
  if (ex) return { id: ex.id };
  const { data, error } = await supabase
    .from("dealer_targets")
    .insert({ company_id: input.companyId, year: input.year, created_by: profile.id })
    .select("id")
    .single();
  if (error) {
    const { data: again } = await supabase
      .from("dealer_targets")
      .select("id")
      .eq("company_id", input.companyId)
      .eq("year", input.year)
      .maybeSingle();
    if (again) return { id: again.id };
    return { error: error.message };
  }
  revalidate(input.companyId, input.year);
  return { id: data.id };
}

/** Replace all category lines (target + manual actuals). */
export async function saveTargetLines(input: {
  targetId: string | null;
  companyId: string;
  year: number;
  note?: string | null;
  lines: {
    categoryId: string;
    targetQty: number;
    targetEur: number;
    actualQty: number;
    actualEur: number;
  }[];
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const supabase = createClient();
  const ensured = input.targetId
    ? { id: input.targetId }
    : await ensureTarget({ companyId: input.companyId, year: input.year });
  if (ensured.error || !ensured.id) return { error: ensured.error ?? "Hedef açılamadı." };
  const targetId = ensured.id;
  const clean = (n: unknown) => {
    const x = Number(n);
    return Number.isFinite(x) && x >= 0 ? x : 0;
  };
  for (const l of input.lines) {
    const { error } = await supabase.from("dealer_target_lines").upsert(
      {
        target_id: targetId,
        category_id: l.categoryId,
        target_qty: Math.round(clean(l.targetQty)),
        target_eur: Math.round(clean(l.targetEur) * 100) / 100,
        actual_qty: Math.round(clean(l.actualQty)),
        actual_eur: Math.round(clean(l.actualEur) * 100) / 100,
      },
      { onConflict: "target_id,category_id" }
    );
    if (error) return { error: error.message };
  }
  const { error } = await supabase
    .from("dealer_targets")
    .update({ note: input.note?.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", targetId);
  if (error) return { error: error.message };
  revalidate(input.companyId, input.year);
  return { ok: true };
}

/** Draft → Mutabık (with date + contact) / İptal, or back to draft. */
export async function setTargetStatus(input: {
  targetId: string | null;
  companyId: string;
  year: number;
  status: TargetStatus;
  agreedAt?: string | null;
  agreedWith?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  if (!(TARGET_STATUSES as readonly string[]).includes(input.status))
    return { error: "Geçersiz durum." };
  const supabase = createClient();
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.status === "mutabik") {
    const d = (input.agreedAt ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: "Mutabakat tarihi girin." };
    patch.agreed_at = d;
    patch.agreed_with = input.agreedWith || null;
  } else if (input.status === "taslak") {
    patch.agreed_at = null;
    patch.agreed_with = null;
  }
  const ensured = input.targetId
    ? { id: input.targetId }
    : await ensureTarget({ companyId: input.companyId, year: input.year });
  if (ensured.error || !ensured.id) return { error: ensured.error ?? "Hedef açılamadı." };
  const { error } = await supabase
    .from("dealer_targets")
    .update(patch)
    .eq("id", ensured.id);
  if (error) return { error: error.message };
  revalidate(input.companyId, input.year);
  return { ok: true };
}
