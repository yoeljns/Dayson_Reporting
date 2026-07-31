import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_OWNER_DEPT_LABELS,
  type ComplaintType,
  type ComplaintOwnerDept,
} from "@/lib/enums";
import { todayIso } from "@/lib/week";

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

export type DeptRow = {
  label: string;
  opened: number;
  resolved: number;
  avgDays: number | null;
  overdue: number;
};

export type ComplaintAnalysis = {
  /** Mean days from opening to resolution, for complaints resolved in period. */
  avgResolutionDays: number | null;
  resolvedCount: number;
  /** Share of resolved complaints closed on or before their due date. */
  onTimePct: number | null;
  /** Still open past the due date (as of today, not period-bound). */
  overdueOpen: number;
  openedCount: number;
  byDept: DeptRow[];
  byType: { label: string; count: number }[];
  byCategory: { label: string; count: number }[];
};

type Row = {
  id: string;
  status: string;
  owner_dept: string;
  type: string;
  due_date: string | null;
  created_at: string;
  resolved_at: string | null;
  product_category_id: string | null;
};

const COLS =
  "id, status, owner_dept, type, due_date, created_at, resolved_at, product_category_id";

export async function analyzeComplaints(
  supabase: SupabaseClient,
  start: string,
  end: string
): Promise<ComplaintAnalysis> {
  const today = todayIso();
  // Widen the SQL bounds by a day on each side (the TR calendar day can differ
  // from the UTC one) and do the exact day filtering in TR time below.
  const lo = `${start}T00:00:00Z`;
  const hi = `${end}T23:59:59.999Z`;
  const loPad = new Date(Date.parse(lo) - 86400000).toISOString();
  const hiPad = new Date(Date.parse(hi) + 86400000).toISOString();

  // Three bounded queries instead of one unbounded scan: opened in period,
  // resolved in period, and (regardless of age) still-open overdue ones.
  const [{ data: openedRows }, { data: resolvedRows }, { data: overdueRows }, { data: cats }] =
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
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(FETCH_CAP),
      supabase.from("product_categories").select("id, label_tr"),
    ]);

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
  const overdue = (overdueRows ?? []) as Row[];

  const dept = new Map<string, DeptRow & { daysSum: number; daysN: number }>();
  const ensureDept = (key: string) => {
    let d = dept.get(key);
    if (!d) {
      d = {
        label:
          COMPLAINT_OWNER_DEPT_LABELS[key as ComplaintOwnerDept] ?? key,
        opened: 0,
        resolved: 0,
        avgDays: null,
        overdue: 0,
        daysSum: 0,
        daysN: 0,
      };
      dept.set(key, d);
    }
    return d;
  };

  const type = new Map<string, number>();
  const category = new Map<string, number>();
  let daysSum = 0;
  let onTime = 0;
  let onTimeBase = 0;

  for (const c of opened) {
    ensureDept(c.owner_dept).opened++;
    type.set(c.type, (type.get(c.type) ?? 0) + 1);
    if (c.product_category_id)
      category.set(
        c.product_category_id,
        (category.get(c.product_category_id) ?? 0) + 1
      );
  }

  for (const c of resolved) {
    const d = ensureDept(c.owner_dept);
    const days = Math.max(
      0,
      differenceInCalendarDays(
        parseISO(c.resolved_at as string),
        parseISO(c.created_at)
      )
    );
    daysSum += days;
    d.resolved++;
    d.daysSum += days;
    d.daysN++;
    if (c.due_date) {
      onTimeBase++;
      if (trDate(c.resolved_at as string) <= c.due_date) onTime++;
    }
  }

  // Overdue is a "right now" figure — open complaints past their due date.
  for (const c of overdue) ensureDept(c.owner_dept).overdue++;

  const openedCount = opened.length;
  const resolvedCount = resolved.length;
  const overdueOpen = overdue.length;

  const byDept = [...dept.values()]
    .map((d) => ({
      label: d.label,
      opened: d.opened,
      resolved: d.resolved,
      avgDays: d.daysN > 0 ? Math.round((d.daysSum / d.daysN) * 10) / 10 : null,
      overdue: d.overdue,
    }))
    .filter((d) => d.opened > 0 || d.resolved > 0 || d.overdue > 0)
    .sort((a, b) => b.opened - a.opened || b.overdue - a.overdue);

  return {
    avgResolutionDays:
      resolvedCount > 0 ? Math.round((daysSum / resolvedCount) * 10) / 10 : null,
    resolvedCount,
    onTimePct:
      onTimeBase > 0 ? Math.round((onTime / onTimeBase) * 100) : null,
    overdueOpen,
    openedCount,
    byDept,
    byType: [...type.entries()]
      .map(([k, count]) => ({
        label: COMPLAINT_TYPE_LABELS[k as ComplaintType] ?? k,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    byCategory: [...category.entries()]
      .map(([k, count]) => ({ label: catLabel.get(k) ?? "—", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}
