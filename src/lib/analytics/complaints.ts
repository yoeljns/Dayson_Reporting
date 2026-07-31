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
  status: string;
  owner_dept: string;
  type: string;
  due_date: string | null;
  created_at: string;
  resolved_at: string | null;
  product_category_id: string | null;
};

export async function analyzeComplaints(
  supabase: SupabaseClient,
  start: string,
  end: string
): Promise<ComplaintAnalysis> {
  const today = todayIso();
  // End of the period as an exclusive timestamp bound (created_at is timestamptz).
  const endNext = `${end}T23:59:59.999Z`;

  const [{ data: rows }, { data: cats }] = await Promise.all([
    supabase
      .from("complaints")
      .select(
        "status, owner_dept, type, due_date, created_at, resolved_at, product_category_id"
      )
      .eq("is_draft", false)
      .lte("created_at", endNext)
      .limit(FETCH_CAP),
    supabase.from("product_categories").select("id, label_tr"),
  ]);

  const catLabel = new Map(
    ((cats ?? []) as { id: string; label_tr: string }[]).map((c) => [
      c.id,
      c.label_tr,
    ])
  );
  const all = (rows ?? []) as Row[];

  const inPeriod = (iso: string | null) =>
    iso != null && iso.slice(0, 10) >= start && iso.slice(0, 10) <= end;

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
  let openedCount = 0;
  let resolvedCount = 0;
  let daysSum = 0;
  let onTime = 0;
  let onTimeBase = 0;
  let overdueOpen = 0;

  for (const c of all) {
    const d = ensureDept(c.owner_dept);

    if (inPeriod(c.created_at)) {
      openedCount++;
      d.opened++;
      type.set(c.type, (type.get(c.type) ?? 0) + 1);
      if (c.product_category_id)
        category.set(
          c.product_category_id,
          (category.get(c.product_category_id) ?? 0) + 1
        );
    }

    if (c.resolved_at && inPeriod(c.resolved_at)) {
      const days = Math.max(
        0,
        differenceInCalendarDays(
          parseISO(c.resolved_at),
          parseISO(c.created_at)
        )
      );
      resolvedCount++;
      daysSum += days;
      d.resolved++;
      d.daysSum += days;
      d.daysN++;
      if (c.due_date) {
        onTimeBase++;
        if (c.resolved_at.slice(0, 10) <= c.due_date) onTime++;
      }
    }

    // Overdue is a "right now" figure — open complaints past their due date.
    const open = c.status === "acik" || c.status === "islemde";
    if (open && c.due_date && c.due_date < today) {
      overdueOpen++;
      d.overdue++;
    }
  }

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
