"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeMonthly } from "@/lib/rules/target";

/**
 * A salesperson proposes (or re-submits) a dealer's yearly target. The
 * proposal waits for a manager; the live target is untouched until approval.
 */
export async function submitTargetProposal(input: {
  companyId: string;
  year: number;
  note?: string | null;
  lines: { salesCategoryId: string; targetQty: number; monthly?: number[] | null }[];
}): Promise<{ ok?: boolean; error?: string }> {
  const profile = await requireProfile();
  if (!Number.isInteger(input.year) || input.year < 2020 || input.year > 2100)
    return { error: "Geçersiz yıl." };
  const supabase = createClient();
  const { data: cats } = await supabase.from("sales_categories").select("id, code, monthly");
  const catById = new Map(
    ((cats as { id: string; code: string; monthly: boolean }[] | null) ?? []).map((c) => [c.id, c])
  );
  const clean = (n: unknown) => {
    const x = Number(n);
    return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : 0;
  };
  const lines: Record<string, { target_qty: number; monthly_qty: number[] | null }> = {};
  let any = false;
  for (const l of input.lines) {
    const c = catById.get(l.salesCategoryId);
    if (!c) return { error: "Geçersiz kategori." };
    const monthly = c.monthly ? normalizeMonthly(l.monthly).map(clean) : null;
    const targetQty = monthly ? monthly.reduce((a, b) => a + b, 0) : clean(l.targetQty);
    if (targetQty > 0) any = true;
    lines[c.code] = { target_qty: targetQty, monthly_qty: monthly };
  }
  if (!any) return { error: "En az bir kategori için hedef girin." };

  const { data: pending } = await supabase
    .from("dealer_target_proposals")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("year", input.year)
    .eq("proposed_by", profile.id)
    .eq("status", "bekliyor")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const note = input.note?.trim() || null;
  const { error } = pending
    ? await supabase
        .from("dealer_target_proposals")
        .update({ lines, note, updated_at: new Date().toISOString() })
        .eq("id", pending.id)
    : await supabase.from("dealer_target_proposals").insert({
        company_id: input.companyId,
        year: input.year,
        proposed_by: profile.id,
        lines,
        note,
      });
  if (error) {
    if (/row-level security/i.test(error.message))
      return { error: "Bu bayi size atanmamış; hedef öneremezsiniz." };
    return { error: error.message };
  }
  revalidatePath(`/firma/${input.companyId}`);
  revalidatePath("/admin/hedefler");
  revalidatePath(`/admin/hedefler/${input.companyId}/${input.year}`);
  revalidatePath("/admin");
  return { ok: true };
}
