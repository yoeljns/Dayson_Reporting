import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealerTarget, DealerTargetLine } from "@/types/db";

export type TargetWithLines = DealerTarget & { lines: DealerTargetLine[] };

/** One dealer's target for a year (null when none). */
export async function getTargetFor(
  supabase: SupabaseClient,
  companyId: string,
  year: number
): Promise<TargetWithLines | null> {
  const { data: t } = await supabase
    .from("dealer_targets")
    .select("*")
    .eq("company_id", companyId)
    .eq("year", year)
    .maybeSingle();
  if (!t) return null;
  const { data: lines } = await supabase
    .from("dealer_target_lines")
    .select("*")
    .eq("target_id", t.id);
  return { ...(t as DealerTarget), lines: (lines as DealerTargetLine[] | null) ?? [] };
}

/** All targets of a year keyed by company id (lists, dashboard). */
export async function targetsForYear(
  supabase: SupabaseClient,
  year: number
): Promise<Map<string, TargetWithLines>> {
  const { data: ts } = await supabase
    .from("dealer_targets")
    .select("*")
    .eq("year", year)
    .limit(5000);
  const targets = (ts as DealerTarget[] | null) ?? [];
  const map = new Map<string, TargetWithLines>();
  for (const t of targets) map.set(t.company_id, { ...t, lines: [] });
  const ids = targets.map((t) => t.id);
  const byId = new Map(Array.from(map.values()).map((t) => [t.id, t]));
  for (let i = 0; i < ids.length; i += 300) {
    const { data: lines } = await supabase
      .from("dealer_target_lines")
      .select("*")
      .in("target_id", ids.slice(i, i + 300));
    for (const l of (lines as DealerTargetLine[] | null) ?? [])
      byId.get(l.target_id)?.lines.push(l);
  }
  return map;
}
