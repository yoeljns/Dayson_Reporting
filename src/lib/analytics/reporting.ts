import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reporting discipline: how long reports take, how much voice is used, how
 * many planned visits were never reported, per salesperson.
 */
export type RepReporting = {
  repId: string;
  name: string;
  planned: number;
  reported: number;
  unreported: number;
  completedVisits: number;
  avgSeconds: number | null;
};

export type ReportingAnalysis = {
  avgSeconds: number | null;
  medianSeconds: number | null;
  quickShare: number | null;
  voiceShare: number | null;
  measured: number;
  openDrafts: number;
  planned: number;
  unreported: number;
  byRep: RepReporting[];
};

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export async function analyzeReporting(
  supabase: SupabaseClient,
  start: string,
  end: string
): Promise<ReportingAnalysis> {
  const [{ data: visits }, { data: metrics }, { data: planItems }, { data: profiles }, { count: openDrafts }] =
    await Promise.all([
      supabase
        .from("visits")
        .select("id, salesperson_id, company_id, visit_date, status")
        .gte("visit_date", start)
        .lte("visit_date", end)
        .is("deleted_at", null)
        .limit(20000),
      supabase
        .from("visit_metrics")
        .select("visit_id, seconds_active, mode, voice_used, completed_at")
        .not("completed_at", "is", null)
        .gte("completed_at", `${start}T00:00:00`)
        .lte("completed_at", `${end}T23:59:59`)
        .limit(20000),
      supabase
        .from("visit_plan_items")
        .select("company_id, planned_date, visit_plans!inner(salesperson_id)")
        .gte("planned_date", start)
        .lte("planned_date", end)
        .limit(20000),
      supabase.from("profiles").select("id, full_name, role, is_active"),
      supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("status", "taslak")
        .is("deleted_at", null),
    ]);

  const vs = (visits as { id: string; salesperson_id: string; company_id: string; visit_date: string; status: string }[] | null) ?? [];
  const completed = vs.filter((v) => v.status === "tamamlandi");
  const completedKey = new Set(completed.map((v) => `${v.salesperson_id}|${v.company_id}|${v.visit_date}`));
  const ms = (metrics as { visit_id: string; seconds_active: number; mode: string; voice_used: boolean }[] | null) ?? [];
  const secsByVisit = new Map(ms.map((m) => [m.visit_id, Number(m.seconds_active) || 0]));
  const secs = ms.map((m) => Number(m.seconds_active) || 0).filter((s) => s > 0);

  const reps = ((profiles as { id: string; full_name: string; role: string; is_active: boolean }[] | null) ?? []).filter(
    (p) => p.role === "salesperson" && p.is_active
  );
  const byRep = new Map<string, RepReporting>();
  for (const r of reps) byRep.set(r.id, { repId: r.id, name: r.full_name, planned: 0, reported: 0, unreported: 0, completedVisits: 0, avgSeconds: null });

  for (const it of (planItems as unknown as {
    company_id: string;
    planned_date: string | null;
    visit_plans: { salesperson_id: string } | { salesperson_id: string }[] | null;
  }[] | null) ?? []) {
    const vp = Array.isArray(it.visit_plans) ? it.visit_plans[0] : it.visit_plans;
    if (!vp || !it.planned_date) continue;
    const r = byRep.get(vp.salesperson_id);
    if (!r) continue;
    r.planned += 1;
    if (completedKey.has(`${vp.salesperson_id}|${it.company_id}|${it.planned_date}`)) r.reported += 1;
    else r.unreported += 1;
  }
  const secsByRep = new Map<string, number[]>();
  for (const v of completed) {
    const r = byRep.get(v.salesperson_id);
    if (!r) continue;
    r.completedVisits += 1;
    const s = secsByVisit.get(v.id);
    if (s && s > 0) (secsByRep.get(v.salesperson_id) ?? secsByRep.set(v.salesperson_id, []).get(v.salesperson_id)!).push(s);
  }
  for (const [id, arr] of secsByRep) {
    const r = byRep.get(id);
    if (r && arr.length) r.avgSeconds = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  const list = Array.from(byRep.values()).sort((a, b) => b.unreported - a.unreported || a.name.localeCompare(b.name, "tr"));
  return {
    avgSeconds: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : null,
    medianSeconds: median(secs),
    quickShare: ms.length ? ms.filter((m) => m.mode === "hizli").length / ms.length : null,
    voiceShare: ms.length ? ms.filter((m) => m.voice_used).length / ms.length : null,
    measured: ms.length,
    openDrafts: openDrafts ?? 0,
    planned: list.reduce((a, r) => a + r.planned, 0),
    unreported: list.reduce((a, r) => a + r.unreported, 0),
    byRep: list,
  };
}

export const fmtDuration = (secs: number | null) => {
  if (secs == null) return "—";
  if (secs < 60) return `${secs} sn`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m} dk ${s} sn` : `${m} dk`;
};
