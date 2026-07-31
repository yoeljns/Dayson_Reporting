import type { SupabaseClient } from "@supabase/supabase-js";
import { daysSince } from "@/lib/week";

/** Dealer coverage: who we are visiting, who is slipping away, and where. */

const DEALER_CAP = 20000;

export type Bucket = { label: string; count: number };

export type GroupRow = {
  label: string;
  dealers: number;
  /** Dealers visited at least once inside the selected period. */
  visited: number;
  /** Average days since last visit (never-visited dealers excluded). */
  avgDays: number | null;
  neverVisited: number;
};

export type CoverageAnalysis = {
  totalDealers: number;
  buckets: Bucket[];
  byCity: GroupRow[];
  bySegment: GroupRow[];
};

/** Set of dealers with at least one completed visit inside [start, end]. */
async function fetchVisitedCompanyIds(
  supabase: SupabaseClient,
  start: string,
  end: string
): Promise<Set<string>> {
  const PAGE = 1000;
  const MAX_PAGES = 50; // 50k visits — far beyond any real period
  const ids = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("visits")
      .select("company_id")
      .eq("status", "tamamlandi")
      .is("deleted_at", null)
      .gte("visit_date", start)
      .lte("visit_date", end)
      .order("visit_date", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) break;
    const rows = (data ?? []) as { company_id: string }[];
    for (const r of rows) ids.add(r.company_id);
    if (rows.length < PAGE) break;
  }
  return ids;
}

const BUCKETS: { label: string; max: number | null }[] = [
  { label: "0-15 gün", max: 15 },
  { label: "16-30 gün", max: 30 },
  { label: "31-60 gün", max: 60 },
  { label: "60+ gün", max: null },
];

export async function analyzeCoverage(
  supabase: SupabaseClient,
  start: string,
  end: string
): Promise<CoverageAnalysis> {
  const [{ data: dealers }, { data: lastVisits }, visitedIds] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, city, segment")
      .eq("kind", "distributor")
      .is("deleted_at", null)
      .limit(DEALER_CAP),
    supabase
      .from("company_last_visit")
      .select("company_id, last_visit_date")
      .limit(DEALER_CAP),
    // A long period can hold more visits than a single page: walk them all,
    // otherwise an arbitrary slice would understate every coverage figure.
    fetchVisitedCompanyIds(supabase, start, end),
  ]);

  const lastVisit = new Map(
    (
      (lastVisits ?? []) as {
        company_id: string;
        last_visit_date: string | null;
      }[]
    ).map((r) => [r.company_id, r.last_visit_date])
  );
  const visitedInPeriod = visitedIds;

  const rows = (dealers ?? []) as {
    id: string;
    city: string | null;
    segment: string | null;
  }[];

  const bucketCounts = BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  let never = 0;

  type Acc = { dealers: number; visited: number; daysSum: number; daysN: number; never: number };
  const city = new Map<string, Acc>();
  const segment = new Map<string, Acc>();
  const bump = (m: Map<string, Acc>, key: string) => {
    let a = m.get(key);
    if (!a) {
      a = { dealers: 0, visited: 0, daysSum: 0, daysN: 0, never: 0 };
      m.set(key, a);
    }
    return a;
  };

  for (const d of rows) {
    const last = lastVisit.get(d.id) ?? null;
    const gap = last ? daysSince(last) ?? 0 : null;

    if (gap === null) {
      never++;
    } else {
      const idx = BUCKETS.findIndex((b) => b.max !== null && gap <= b.max);
      bucketCounts[idx === -1 ? BUCKETS.length - 1 : idx].count++;
    }

    for (const [m, key] of [
      [city, d.city?.trim() || "Belirtilmemiş"],
      [segment, d.segment?.trim() || "Segmentsiz"],
    ] as [Map<string, Acc>, string][]) {
      const a = bump(m, key);
      a.dealers++;
      if (visitedInPeriod.has(d.id)) a.visited++;
      if (gap === null) a.never++;
      else {
        a.daysSum += gap;
        a.daysN++;
      }
    }
  }

  const toRows = (m: Map<string, Acc>): GroupRow[] =>
    [...m.entries()]
      .map(([label, a]) => ({
        label,
        dealers: a.dealers,
        visited: a.visited,
        avgDays: a.daysN > 0 ? Math.round(a.daysSum / a.daysN) : null,
        neverVisited: a.never,
      }))
      // Worst coverage first — that is where a manager needs to look.
      .sort((x, y) => {
        const rx = x.dealers > 0 ? x.visited / x.dealers : 0;
        const ry = y.dealers > 0 ? y.visited / y.dealers : 0;
        return rx - ry || y.dealers - x.dealers;
      });

  return {
    totalDealers: rows.length,
    buckets: [...bucketCounts, { label: "Hiç ziyaret yok", count: never }],
    byCity: toRows(city),
    bySegment: toRows(segment).sort((a, b) => a.label.localeCompare(b.label, "tr")),
  };
}
