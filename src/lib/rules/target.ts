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
