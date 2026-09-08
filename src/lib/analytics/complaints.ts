import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays, parseISO } from "date-fns";

/** Complaint handling quality: how fast we close, and where it hurts. */

const FETCH_CAP = 10000;

/**
 * Calendar date of a timestamptz in the team's timezone. Slicing the raw ISO
 * string would use UTC and push anything logged between 00:00 and 03:00 TR
 * into the previous day (same reason week.ts pins APP_TZ).
 */
const TR_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function trDate(iso: string): string {
  return TR_DATE.format(new Date(iso));
}

export type ComplaintAnalysis = {
  /** Mean days from opening to resolution, for complaints resolved in period. */
  avgResolutionDays: number | null;
  resolvedCount: number;
  openedCount: number;
  /** Open right now (not period-bound). */
  openNow: number;
  /** Open for more than 14 days, right now. */
  openOver14: number;
  byCategory: { label: string; count: number }[];
  /** Per salesperson: opened in period. */
  byReporter: { label: string; count: number }[];
};

type Row = {
  id: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  product_category_id: string | null;
  reported_by: string | null;
};

const COLS = "id, status, created_at, resolved_at, product_category_id, reported_by";

export async function analyzeComplaints(
  supabase: SupabaseClient,
  start: string,
  end: string
): Promise<ComplaintAnalysis> {
  // Widen the SQL bounds by a day on each side (the TR calendar day can differ
  // from the UTC one) and do the exact day filtering in TR time below.
  const lo = `${start}T00:00:00Z`;
  const hi = `${end}T23:59:59.999Z`;
  const loPad = new Date(Date.parse(lo) - 86400000).toISOString();
  const hiPad = new Date(Date.parse(hi) + 86400000).toISOString();

  // Bounded queries: opened in period, resolved in period, open right now.
  const [{ data: openedRows }, { data: resolvedRows }, { data: openRows }, { data: cats }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("complaints")
        .select(COLS)
        .eq("is_draft", false)
        .gte("created_at", loPad)
        .lte("created_at", hiPad)
        .order("created_at", { ascending: false })
        .limit(FETCH_CAP),
      supabase
        .from("complaints")
        .select(COLS)
        .eq("is_draft", false)
        .not("resolved_at", "is", null)
        .gte("resolved_at", loPad)
        .lte("resolved_at", hiPad)
        .order("resolved_at", { ascending: false })
        .limit(FETCH_CAP),
      supabase
        .from("complaints")
        .select(COLS)
        .eq("is_draft", false)
        .in("status", ["acik", "islemde"])
        .order("created_at", { ascending: true })
        .limit(FETCH_CAP),
      supabase.from("product_categories").select("id, label_tr"),
      supabase.from("profiles").select("id, full_name"),
    ]);
  const repName = new Map(((profiles ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));

  const catLabel = new Map(
    ((cats ?? []) as { id: string; label_tr: string }[]).map((c) => [
      c.id,
      c.label_tr,
    ])
  );
  const opened = ((openedRows ?? []) as Row[]).filter((c) => {
    const d = trDate(c.created_at);
    return d >= start && d <= end;
  });
  const resolved = ((resolvedRows ?? []) as Row[]).filter((c) => {
    const d = trDate(c.resolved_at as string);
    return d >= start && d <= end;
  });
  const openNowRows = (openRows ?? []) as Row[];

  const category = new Map<string, number>();
  const reporter = new Map<string, number>();
  let daysSum = 0;

  for (const c of opened) {
    if (c.product_category_id)
      category.set(c.product_category_id, (category.get(c.product_category_id) ?? 0) + 1);
    if (c.reported_by) reporter.set(c.reported_by, (reporter.get(c.reported_by) ?? 0) + 1);
  }
  for (const c of resolved) {
    daysSum += Math.max(
      0,
      differenceInCalendarDays(parseISO(c.resolved_at as string), parseISO(c.created_at))
    );
  }
  const openOver14 = openNowRows.filter(
    (c) => differenceInCalendarDays(new Date(), parseISO(c.created_at)) > 14
  ).length;

  const openedCount = opened.length;
  const resolvedCount = resolved.length;

  return {
    avgResolutionDays:
      resolvedCount > 0 ? Math.round((daysSum / resolvedCount) * 10) / 10 : null,
    resolvedCount,
    openedCount,
    openNow: openNowRows.length,
    openOver14,
    byCategory: [...category.entries()]
      .map(([k, count]) => ({ label: catLabel.get(k) ?? "—", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    byReporter: [...reporter.entries()]
      .map(([k, count]) => ({ label: repName.get(k) ?? "—", count }))
      .sort((a, b) => b.count - a.count),
  };
}
