import { addDays, parseISO, format, startOfMonth } from "date-fns";
import { weekStartOf, currentWeekStart, todayIso } from "@/lib/week";

// All "today"-anchored defaults resolve in the team's timezone (Europe/Istanbul,
// see week.ts) — a UTC server must not shift ranges by a day after midnight TR.
export { todayIso };

/**
 * Report filter parsing + shared limits + date-range resolution.
 * Filters arrive as URL query params; each builder validates the enum-typed
 * ones itself (a "status" param means different enums for visits vs complaints).
 */

export const ROW_CAP = 10000; // hard cap per row-based report
export const COVERAGE_CAP = 5000; // dealer-coverage snapshot cap

export type RangeMode = "d30" | "month" | "week" | "none";

export type ReportFilters = {
  start?: string;
  end?: string;
  sp?: string;
  status?: string;
  dept?: string;
  competitor?: string;
  segment?: string;
  kind?: string;
  category?: string;
  company?: string; // company_id (visit report)
  q?: string; // free-text company name (visit report)
};

const ISO = "yyyy-MM-dd";

export function addDaysIso(iso: string, n: number): string {
  return format(addDays(parseISO(iso), n), ISO);
}

/** Exclusive upper bound for a timestamptz day range (whole end-day inclusive). */
export function nextDayIso(iso: string): string {
  return addDaysIso(iso, 1);
}

export function firstOfMonthIso(): string {
  return format(startOfMonth(parseISO(todayIso())), ISO);
}

function clean(v: string | null): string | undefined {
  const t = (v ?? "").trim();
  return t ? t : undefined;
}

export function parseFilters(sp: URLSearchParams): ReportFilters {
  return {
    start: clean(sp.get("start")),
    end: clean(sp.get("end")),
    sp: clean(sp.get("sp")),
    status: clean(sp.get("status")),
    dept: clean(sp.get("dept")),
    competitor: clean(sp.get("competitor")),
    segment: clean(sp.get("segment")),
    kind: clean(sp.get("kind")),
    category: clean(sp.get("category")),
    company: clean(sp.get("company")),
    q: clean(sp.get("q")),
  };
}

/** Resolve a {start,end} range for a report, applying its default when absent. */
export function resolveRange(
  f: ReportFilters,
  mode: RangeMode
): { start: string; end: string } {
  if (mode === "week") {
    const start = f.start ? weekStartOf(parseISO(f.start)) : currentWeekStart();
    const end = f.end ? weekStartOf(parseISO(f.end)) : start;
    return { start, end };
  }
  const end = f.end || todayIso();
  let start = f.start;
  if (!start) start = mode === "month" ? firstOfMonthIso() : addDaysIso(todayIso(), -30);
  return { start, end };
}
