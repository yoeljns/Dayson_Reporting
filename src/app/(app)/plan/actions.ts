"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VisitType } from "@/lib/enums";

/** Bump the plan's updated_at after an item change. */
async function touchPlan(
  supabase: ReturnType<typeof createClient>,
  planId: string
) {
  await supabase
    .from("visit_plans")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", planId);
}

/**
 * Get (or create) the caller's plan for a given week. Idempotent against the
 * (salesperson_id, week_start) unique constraint, so it is safe to call when a
 * plan may already exist (e.g. two tabs).
 */
export async function ensurePlan(
  weekStart: string
): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const { data: existing } = await supabase
    .from("visit_plans")
    .select("id")
    .eq("salesperson_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data, error } = await supabase
    .from("visit_plans")
    .insert({ salesperson_id: user.id, week_start: weekStart })
    .select("id")
    .single();

  // Lost a race with a concurrent create — fetch the winner.
  if (error) {
    const { data: again } = await supabase
      .from("visit_plans")
      .select("id")
      .eq("salesperson_id", user.id)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (again) return { id: again.id };
    return { error: error.message };
  }

  revalidatePath("/plan");
  return { id: data.id };
}

/** Add a company to a plan (no-op upsert if already present). */
export async function addPlanItem(input: {
  planId: string;
  companyId: string;
  plannedDate?: string | null;
  visitType?: VisitType | null;
  note?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visit_plan_items")
    .upsert(
      {
        plan_id: input.planId,
        company_id: input.companyId,
        planned_date: input.plannedDate ?? null,
        visit_type: input.visitType ?? null,
        note: input.note ?? null,
      },
      { onConflict: "plan_id,company_id", ignoreDuplicates: true }
    );
  if (error) return { error: error.message };
  await touchPlan(supabase, input.planId);
  revalidatePath(`/plan/${input.planId}`);
  return { ok: true };
}

/** Update a planned item's day / visit type / note. */
export async function updatePlanItem(input: {
  id: string;
  planId: string;
  plannedDate?: string | null;
  visitType?: VisitType | null;
  note?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visit_plan_items")
    .update({
      planned_date: input.plannedDate ?? null,
      visit_type: input.visitType ?? null,
      note: input.note ?? null,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };
  await touchPlan(supabase, input.planId);
  revalidatePath(`/plan/${input.planId}`);
  return { ok: true };
}

/** Remove a planned item. */
export async function removePlanItem(input: {
  id: string;
  planId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visit_plan_items")
    .delete()
    .eq("id", input.id);
  if (error) return { error: error.message };
  await touchPlan(supabase, input.planId);
  revalidatePath(`/plan/${input.planId}`);
  return { ok: true };
}

/** Save a free-text note on the plan. */
export async function savePlanNote(input: {
  planId: string;
  note: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visit_plans")
    .update({ note: input.note.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", input.planId);
  if (error) return { error: error.message };
  revalidatePath(`/plan/${input.planId}`);
  return { ok: true };
}

/** Mark the plan submitted (locks editing until reopened). */
export async function submitPlan(
  planId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visit_plans")
    .update({
      status: "gonderildi",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);
  if (error) return { error: error.message };
  revalidatePath("/plan");
  revalidatePath(`/plan/${planId}`);
  return { ok: true };
}

/** Reopen a submitted plan for further edits. */
export async function reopenPlan(
  planId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visit_plans")
    .update({
      status: "taslak",
      submitted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);
  if (error) return { error: error.message };
  revalidatePath("/plan");
  revalidatePath(`/plan/${planId}`);
  return { ok: true };
}

/** Delete an entire plan (and its items via cascade). */
export async function deletePlan(
  planId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("visit_plans").delete().eq("id", planId);
  if (error) return { error: error.message };
  revalidatePath("/plan");
  return { ok: true };
}
