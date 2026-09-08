import type { Pace } from "@/lib/enums";
import type { PaceThresholds } from "@/lib/settings";

/** Fraction of `year` elapsed at `todayIso` (0..1). */
export function elapsedFractionOfYear(year: number, todayIso: string): number {
  const y = Number(todayIso.slice(0, 4));
  if (y < year) return 0;
  if (y > year) return 1;
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const now = Date.UTC(
    year,
    Number(todayIso.slice(5, 7)) - 1,
    Number(todayIso.slice(8, 10))
  );
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export type PaceResult = {
  /** actual / target (null when no target). */
  ratio: number | null;
  /** actual / (target × elapsed) — how far along vs. where we should be. */
  paceRatio: number | null;
  pace: Pace | null;
  /** Expected-so-far minus actual, when behind (positive number). */
  gap: number;
};

/** Pace against the time-proportional expectation. */
export function paceOf(
  actual: number,
  target: number,
  elapsed: number,
  t: PaceThresholds
): PaceResult {
  if (!target || target <= 0) return { ratio: null, paceRatio: null, pace: null, gap: 0 };
  const expected = target * elapsed;
  const ratio = actual / target;
  const paceRatio = expected > 0 ? actual / expected : actual > 0 ? Infinity : 1;
  const pace: Pace =
    paceRatio >= t.ahead ? "onde" : paceRatio >= t.onTrack ? "yolunda" : "geride";
  return { ratio, paceRatio, pace, gap: Math.max(0, expected - actual) };
}

export type TargetLineLike = {
  target_qty: number;
  target_eur: number;
  actual_qty: number;
  actual_eur: number;
};

export function sumLines(lines: TargetLineLike[]) {
  return lines.reduce(
    (a, l) => ({
      target_qty: a.target_qty + Number(l.target_qty || 0),
      target_eur: a.target_eur + Number(l.target_eur || 0),
      actual_qty: a.actual_qty + Number(l.actual_qty || 0),
      actual_eur: a.actual_eur + Number(l.actual_eur || 0),
    }),
    { target_qty: 0, target_eur: 0, actual_qty: 0, actual_eur: 0 }
  );
}

export const fmtEur = (n: number) =>
  `€${Number(n || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`;
export const fmtQty = (n: number) => Number(n || 0).toLocaleString("tr-TR");

// ---------------------------------------------------------------------------
// Targets v2 — quantity per sales category, shipments as actuals
// ---------------------------------------------------------------------------
import type { SalesCategory, SalesUnit } from "@/types/db";
import type { CompanyShipments } from "@/lib/sales/server";

export const MONTHS_TR_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** "12,5 palet" / "1.200 adet" / "8 koli". */
export function fmtQtyUnit(n: number, unit: SalesUnit): string {
  const v = Number(n || 0);
  return v.toLocaleString("tr-TR", { maximumFractionDigits: unit === "adet" ? 0 : 1 });
}
export const fmtUnit = (n: number, unit: SalesUnit) => `${fmtQtyUnit(n, unit)} ${unit}`;

/** Pace against an explicit expectation (monthly targets are not linear). */
export function paceWithExpected(
  actual: number,
  target: number,
  expected: number,
  t: PaceThresholds
): PaceResult {
  if (!target || target <= 0) return { ratio: null, paceRatio: null, pace: null, gap: 0 };
  const ratio = actual / target;
  const paceRatio = expected > 0 ? actual / expected : actual > 0 ? Infinity : 1;
  const pace: Pace =
    paceRatio >= t.ahead ? "onde" : paceRatio >= t.onTrack ? "yolunda" : "geride";
  return { ratio, paceRatio, pace, gap: Math.max(0, expected - actual) };
}

/** Index of the current month inside `year` (-1 before the year, 11 after it). */
export function monthIndexOf(year: number, todayIso: string): number {
  const y = Number(todayIso.slice(0, 4));
  if (y < year) return -1;
  if (y > year) return 11;
  return Number(todayIso.slice(5, 7)) - 1;
}

/** Fraction of the current month that has elapsed (0..1). */
export function monthFraction(year: number, todayIso: string): number {
  const y = Number(todayIso.slice(0, 4));
  if (y < year) return 0;
  if (y > year) return 1;
  const m = Number(todayIso.slice(5, 7));
  const d = Number(todayIso.slice(8, 10));
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Math.min(1, Math.max(0, d / days));
}

/** Expected-so-far for a monthly plan: full past months + prorated current month. */
export function expectedMonthly(monthly: number[], year: number, todayIso: string): number {
  const idx = monthIndexOf(year, todayIso);
  if (idx < 0) return 0;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const v = Number(monthly[i] || 0);
    if (i < idx) sum += v;
    else if (i === idx) sum += v * monthFraction(year, todayIso);
  }
  return sum;
}

/** Monthly allowance of a monthly-category line ("her ay 15 palet"). */
export const monthlyAllowance = (l: { target_qty: number; monthly_qty: number[] | null }): number => {
  const m = normalizeMonthly(l.monthly_qty);
  const first = m.find((v) => v > 0);
  if (first != null && m.every((v) => v === 0 || v === first)) return first;
  const yearly = Number(l.target_qty) || 0;
  return Math.round((yearly / 12) * 10) / 10;
};

export const normalizeMonthly = (v: unknown): number[] =>
  Array.from({ length: 12 }, (_, i) => {
    const n = Array.isArray(v) ? Number(v[i]) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });

export type LineStatus = {
  category: SalesCategory;
  target: number;
  monthly: number[] | null;
  shipped: number;
  byMonth: number[];
  remaining: number;
  pace: PaceResult;
  /** Current month (only for monthly categories inside the year). */
  month: { index: number; target: number; shipped: number; remaining: number } | null;
};

export type TargetStatus = {
  lines: LineStatus[];
  /** Worst category pace (null when no target line has a quantity). */
  pace: Pace | null;
  behind: number;
  withTarget: number;
  /** Shipped € across all products (informational). */
  eur: number;
};

const PACE_RANK: Record<Pace, number> = { geride: 0, yolunda: 1, onde: 2 };

/**
 * Per-category status for one dealer-year: target vs. shipped quantity in the
 * category's unit, remaining, pace. Categories without a target still show
 * shipped quantities but do not affect the dealer pace.
 */
export function buildTargetStatus(
  lines: { sales_category_id: string | null; target_qty: number; monthly_qty: number[] | null }[],
  categories: SalesCategory[],
  shipments: CompanyShipments | null,
  year: number,
  todayIso: string,
  t: PaceThresholds
): TargetStatus {
  const elapsed = elapsedFractionOfYear(year, todayIso);
  const idx = monthIndexOf(year, todayIso);
  const out: LineStatus[] = [];
  for (const c of categories) {
    const l = lines.find((x) => x.sales_category_id === c.id);
    const tot = shipments?.byCategory.get(c.id) ?? null;
    const monthly = c.monthly ? normalizeMonthly(l?.monthly_qty) : null;
    const target = monthly ? monthly.reduce((a, b) => a + b, 0) : Number(l?.target_qty ?? 0);
    const shipped = tot?.qty ?? 0;
    const byMonth = tot?.byMonth ?? Array(12).fill(0);
    if (!l && shipped === 0) continue;
    const expected = monthly ? expectedMonthly(monthly, year, todayIso) : target * elapsed;
    const pace = paceWithExpected(shipped, target, expected, t);
    const month =
      monthly && idx >= 0 && idx <= 11
        ? {
            index: idx,
            target: monthly[idx],
            shipped: byMonth[idx],
            remaining: Math.max(0, monthly[idx] - byMonth[idx]),
          }
        : null;
    out.push({ category: c, target, monthly, shipped, byMonth, remaining: Math.max(0, target - shipped), pace, month });
  }
  const withTarget = out.filter((x) => x.pace.pace != null);
  const behind = withTarget.filter((x) => x.pace.pace === "geride").length;
  let worst: Pace | null = null;
  for (const x of withTarget) {
    const p = x.pace.pace!;
    if (!worst || PACE_RANK[p] < PACE_RANK[worst]) worst = p;
  }
  return { lines: out, pace: worst, behind, withTarget: withTarget.length, eur: shipments?.eur ?? 0 };
}
