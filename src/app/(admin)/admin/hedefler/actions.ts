"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TARGET_STATUSES, type TargetStatus } from "@/lib/enums";
import { normalizeMonthly } from "@/lib/rules/target";

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

type Snapshot = Record<string, { target_qty: number; monthly_qty: number[] | null }>;
type LineInput = { salesCategoryId: string; targetQty: number; monthly?: number[] | null };

const sameMonthly = (a: number[] | null, b: number[] | null) =>
  (a == null && b == null) || (a != null && b != null && a.every((v, i) => v === b[i]));

/**
 * Upsert quantity lines of a target and record a revision when anything
 * changed. Shared by the manager editor and proposal approval.
 */
async function applyLines(
  supabase: ReturnType<typeof createClient>,
  targetId: string,
  lines: LineInput[],
  changedBy: string,
  reason: string | null
): Promise<{ changed: boolean; error?: string }> {
  const { data: cats } = await supabase.from("sales_categories").select("id, code, monthly");
  const catById = new Map(
    ((cats as { id: string; code: string; monthly: boolean }[] | null) ?? []).map((c) => [c.id, c])
  );
  const { data: existing } = await supabase
    .from("dealer_target_lines")
    .select("sales_category_id, target_qty, monthly_qty")
    .eq("target_id", targetId)
    .not("sales_category_id", "is", null);

  const before: Snapshot = {};
  for (const l of (existing as { sales_category_id: string; target_qty: number; monthly_qty: unknown }[] | null) ?? []) {
    const c = catById.get(l.sales_category_id);
    if (!c) continue;
    before[c.code] = {
      target_qty: Number(l.target_qty) || 0,
      monthly_qty: c.monthly ? normalizeMonthly(l.monthly_qty) : null,
    };
  }

  const clean = (n: unknown) => {
    const x = Number(n);
    return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : 0;
  };
  const after: Snapshot = { ...before };
  let changed = false;
  for (const l of lines) {
    const c = catById.get(l.salesCategoryId);
    if (!c) return { changed: false, error: "Geçersiz kategori." };
    const monthly = c.monthly ? normalizeMonthly(l.monthly).map(clean) : null;
    const targetQty = monthly ? monthly.reduce((a, b) => a + b, 0) : clean(l.targetQty);
    const prev = before[c.code];
    if (
      !prev
        ? targetQty > 0 || (monthly?.some((v) => v > 0) ?? false)
        : prev.target_qty !== targetQty || !sameMonthly(prev.monthly_qty, monthly)
    )
      changed = true;
    after[c.code] = { target_qty: targetQty, monthly_qty: monthly };
    const { error } = await supabase.from("dealer_target_lines").upsert(
      {
        target_id: targetId,
        sales_category_id: c.id,
        category_id: null,
        target_qty: targetQty,
        monthly_qty: monthly,
      },
      { onConflict: "target_id,sales_category_id" }
    );
    if (error) return { changed: false, error: error.message };
  }
  if (changed) {
    await supabase.from("dealer_target_revisions").insert({
      target_id: targetId,
      changed_by: changedBy,
      reason: reason?.trim() || null,
      before,
      after,
    });
  }
  return { changed };
}

/**
 * Replace the quantity targets per sales category. Actuals come from
 * shipments, so only targets are written. When anything changed a revision
 * (before/after + reason) is recorded so the change stays visible.
 */
export async function saveTargetLines(input: {
  targetId: string | null;
  companyId: string;
  year: number;
  note?: string | null;
  reason?: string | null;
  lines: LineInput[];
}): Promise<{ ok?: boolean; changed?: boolean; error?: string }> {
  const profile = await requireManager();
  const supabase = createClient();
  const ensured = input.targetId
    ? { id: input.targetId }
    : await ensureTarget({ companyId: input.companyId, year: input.year });
  if (ensured.error || !ensured.id) return { error: ensured.error ?? "Hedef açılamadı." };
  const targetId = ensured.id;

  const applied = await applyLines(supabase, targetId, input.lines, profile.id, input.reason ?? null);
  if (applied.error) return { error: applied.error };
  const { error } = await supabase
    .from("dealer_targets")
    .update({ note: input.note?.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", targetId);
  if (error) return { error: error.message };
  revalidate(input.companyId, input.year);
  return { ok: true, changed: applied.changed };
}

/**
 * Manager decision on a salesperson's proposal. Approval writes the proposed
 * lines into the target (with a revision) — nothing changes before that.
 */
export async function reviewTargetProposal(input: {
  proposalId: string;
  decision: "onaylandi" | "reddedildi";
  note?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const profile = await requireManager();
  const supabase = createClient();
  const { data: p } = await supabase
    .from("dealer_target_proposals")
    .select("id, company_id, year, proposed_by, lines, status, profiles:proposed_by(full_name)")
    .eq("id", input.proposalId)
    .maybeSingle();
  if (!p || p.status !== "bekliyor") return { error: "Öneri bulunamadı ya da zaten değerlendirildi." };
  const companyId = p.company_id as string;
  const year = p.year as number;
  const note = input.note?.trim() || null;

  if (input.decision === "onaylandi") {
    const ensured = await ensureTarget({ companyId, year });
    if (ensured.error || !ensured.id) return { error: ensured.error ?? "Hedef açılamadı." };
    const { data: cats } = await supabase.from("sales_categories").select("id, code");
    const proposed = (p.lines ?? {}) as Record<string, { target_qty?: number; monthly_qty?: number[] | null }>;
    const lines: LineInput[] = [];
    for (const c of (cats as { id: string; code: string }[] | null) ?? []) {
      const v = proposed[c.code];
      if (!v) continue;
      lines.push({ salesCategoryId: c.id, targetQty: Number(v.target_qty ?? 0), monthly: v.monthly_qty ?? null });
    }
    const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
    const who = (prof as { full_name: string } | null)?.full_name;
    const applied = await applyLines(
      supabase,
      ensured.id,
      lines,
      profile.id,
      `Pazarlamacı önerisi onaylandı${who ? ` (${who})` : ""}${note ? `: ${note}` : ""}`
    );
    if (applied.error) return { error: applied.error };
  }

  const { error } = await supabase
    .from("dealer_target_proposals")
    .update({
      status: input.decision,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.id);
  if (error) return { error: error.message };
  revalidate(companyId, year);
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
