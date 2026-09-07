import type { SupabaseClient } from "@supabase/supabase-js";
import { weekEndOf } from "@/lib/week";

/**
 * Completed (non-deleted) visit dates of a salesperson to the given companies
 * within a plan week, keyed by company id. Used to strike through plan items
 * that were actually carried out.
 */
export async function visitedInWeek(
  supabase: SupabaseClient,
  input: { salespersonId: string; weekStart: string; companyIds: string[] }
): Promise<Record<string, string[]>> {
  if (input.companyIds.length === 0) return {};
  const { data } = await supabase
    .from("visits")
    .select("company_id, visit_date")
    .eq("salesperson_id", input.salespersonId)
    .eq("status", "tamamlandi")
    .is("deleted_at", null)
    .gte("visit_date", input.weekStart)
    .lte("visit_date", weekEndOf(input.weekStart))
    .in("company_id", input.companyIds);
  const out: Record<string, string[]> = {};
  for (const r of (data ?? []) as { company_id: string; visit_date: string }[]) {
    (out[r.company_id] ??= []).push(r.visit_date);
  }
  return out;
}

/** True when a plan item counts as done: a visit on the planned day, or any
 *  visit that week when no day was set. */
export function planItemDone(
  plannedDate: string | null,
  dates: string[] | undefined
): boolean {
  if (!dates || dates.length === 0) return false;
  if (!plannedDate) return true;
  return dates.includes(plannedDate);
}
