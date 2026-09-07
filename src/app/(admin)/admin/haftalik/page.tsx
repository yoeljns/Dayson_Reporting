import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VisitRecord } from "@/components/visit-record";
import { PrintButton } from "@/components/print-button";
import { ExpandAll } from "@/components/expand-all";
import { loadVisitRecords } from "@/lib/visits/records";
import { visitedInWeek, planItemDone } from "@/lib/plans/visited";
import { visitCode } from "@/lib/codes";
import { cn } from "@/lib/utils";
import {
  currentWeekStart,
  shiftWeek,
  weekEndOf,
  weekRangeLabel,
  formatTRDate,
  weekStartOf,
} from "@/lib/week";
import { parseISO } from "date-fns";
import {
  PLAN_STATUS_LABELS,
  PLAN_STATUS_BADGE,
  VISIT_TYPE_LABELS,
  type PlanStatus,
  type VisitType,
} from "@/lib/enums";

type PlanRow = {
  id: string;
  salesperson_id: string;
  status: PlanStatus;
  note: string | null;
  manager_note: string | null;
  visit_plan_items: {
    id: string;
    company_id: string;
    planned_date: string | null;
    visit_type: VisitType | null;
    note: string | null;
    companies: { name: string } | { name: string }[] | null;
  }[];
};

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * Weekly pack for management: every salesperson's plan for the week next to
 * the visit reports they actually wrote that week — readable in one place,
 * printable, and downloadable as one Excel file.
 */
export default async function WeeklyPackPage({
  searchParams,
}: {
  searchParams: { week?: string; sp?: string };
}) {
  await requireManager();
  const supabase = createClient();
  const thisWeek = currentWeekStart();
  // Default: last week — the one whose reports are complete.
  const week =
    searchParams.week && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.week)
      ? weekStartOf(parseISO(searchParams.week))
      : shiftWeek(thisWeek, -1);
  const weekEnd = weekEndOf(week);
  const spFilter = searchParams.sp || null;

  const [{ data: reps }, { data: planRows }, visits] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .eq("role", "salesperson")
      .order("full_name"),
    supabase
      .from("visit_plans")
      .select(
        "id, salesperson_id, status, note, manager_note, visit_plan_items(id, company_id, planned_date, visit_type, note, companies(name))"
      )
      .eq("week_start", week),
    loadVisitRecords(supabase, {
      start: week,
      end: weekEnd,
      salespersonId: spFilter ?? undefined,
    }),
  ]);

  const plans = new Map(((planRows as PlanRow[] | null) ?? []).map((p) => [p.salesperson_id, p]));
  const visitsBySp = new Map<string, typeof visits>();
  for (const v of visits)
    (visitsBySp.get(v.salespersonId) ?? visitsBySp.set(v.salespersonId, []).get(v.salespersonId)!).push(v);

  const team = ((reps as { id: string; full_name: string }[] | null) ?? []).filter(
    (r) => !spFilter || r.id === spFilter
  );

  // Strike-through for planned companies actually visited that week.
  const visitedMap = new Map<string, Record<string, string[]>>();
  for (const r of team) {
    const p = plans.get(r.id);
    if (!p || p.visit_plan_items.length === 0) continue;
    visitedMap.set(
      r.id,
      await visitedInWeek(supabase, {
        salespersonId: r.id,
        weekStart: week,
        companyIds: p.visit_plan_items.map((it) => it.company_id),
      })
    );
  }

  const href = (w: string, sp: string | null = spFilter) =>
    `/admin/haftalik?week=${w}${sp ? `&sp=${sp}` : ""}`;
  const excelHref = `/api/admin/raporlar?type=haftalik&start=${week}&end=${weekEnd}${
    spFilter ? `&sp=${spFilter}` : ""
  }`;
  const totalVisits = visits.length;
  const totalPlanned = team.reduce((a, r) => a + (plans.get(r.id)?.visit_plan_items.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-[15px] leading-relaxed sm:text-base">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Haftalık Özet</h1>
          <p className="text-muted-foreground">
            Pazarlamacı pazarlamacı: haftanın planı ve o hafta yazılan ziyaret
            raporları. Toplantı öncesi tek seferde okumak için.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <a
            href={excelHref}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Download className="h-4 w-4" /> Excel paketi
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Week picker */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={href(shiftWeek(week, -1))} className="rounded-md border p-2 hover:bg-accent">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="font-medium">{weekRangeLabel(week)}</span>
        <Link href={href(shiftWeek(week, 1))} className="rounded-md border p-2 hover:bg-accent">
          <ChevronRight className="h-4 w-4" />
        </Link>
        <Link
          href={href(shiftWeek(thisWeek, -1))}
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            week === shiftWeek(thisWeek, -1) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
          )}
        >
          Geçen hafta
        </Link>
        <Link
          href={href(thisWeek)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            week === thisWeek ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
          )}
        >
          Bu hafta
        </Link>
        <span className="ml-auto text-sm text-muted-foreground">
          {totalPlanned} planlı · {totalVisits} ziyaret raporu
        </span>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Link
          href={href(week, null)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            !spFilter ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
          )}
        >
          Tüm ekip
        </Link>
        {((reps as { id: string; full_name: string }[] | null) ?? []).map((r) => (
          <Link
            key={r.id}
            href={href(week, r.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              spFilter === r.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {r.full_name}
          </Link>
        ))}
      </div>
      <p className="hidden print:block text-sm text-muted-foreground">{weekRangeLabel(week)}</p>

      {team.map((r) => {
        const plan = plans.get(r.id);
        const list = visitsBySp.get(r.id) ?? [];
        const visited = visitedMap.get(r.id) ?? {};
        const sectionId = `rep-${r.id}`;
        return (
          <section key={r.id} className="space-y-3 break-inside-avoid-page">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1">
              <h2 className="text-xl font-semibold">
                <Link href={`/admin/pazarlamaci/${r.id}`} className="hover:underline">
                  {r.full_name}
                </Link>
              </h2>
              <span className="text-sm text-muted-foreground">
                {plan ? `${plan.visit_plan_items.length} planlı` : "plan yok"} · {list.length} rapor
              </span>
            </div>

            {/* Plan */}
            <Card>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="section-label">Plan</span>
                  {plan ? (
                    <Badge variant={PLAN_STATUS_BADGE[plan.status]}>{PLAN_STATUS_LABELS[plan.status]}</Badge>
                  ) : (
                    <Badge variant="secondary">Plan yapılmamış</Badge>
                  )}
                  {plan && (
                    <Link href={`/admin/planlar/${plan.id}`} className="ml-auto text-xs underline print:hidden">
                      Planı aç
                    </Link>
                  )}
                </div>
                {plan && plan.visit_plan_items.length > 0 && (
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {plan.visit_plan_items
                      .slice()
                      .sort((a, b) => (a.planned_date ?? "9") < (b.planned_date ?? "9") ? -1 : 1)
                      .map((it) => {
                        const done = planItemDone(it.planned_date, visited[it.company_id]);
                        return (
                          <li key={it.id} className={cn("flex items-baseline gap-2", done && "text-muted-foreground")}>
                            <span className={cn("font-medium", done && "line-through")}>
                              {one(it.companies)?.name ?? "Firma"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {it.planned_date ? formatTRDate(it.planned_date) : ""}
                              {it.visit_type ? ` · ${VISIT_TYPE_LABELS[it.visit_type]}` : ""}
                              {it.note ? ` · ${it.note}` : ""}
                            </span>
                            {done && <Badge variant="success">Yapıldı</Badge>}
                          </li>
                        );
                      })}
                  </ul>
                )}
                {plan?.manager_note && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Yönetici notu: </span>
                    {plan.manager_note}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Visit reports */}
            <div className="flex items-center justify-between">
              <span className="section-label">Ziyaret raporları ({list.length})</span>
              {list.length > 1 && <ExpandAll targetId={sectionId} />}
            </div>
            {list.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-muted-foreground">
                  Bu hafta tamamlanmış ziyaret raporu yok.
                </CardContent>
              </Card>
            ) : (
              <div id={sectionId} className="space-y-2">
                {list.map((v, i) => (
                  <Card key={v.id}>
                    <CardContent className="p-0">
                      <details className="group" open={i === 0}>
                        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 p-4 hover:bg-accent">
                          <span className="font-semibold">{v.companyName ?? "Firma"}</span>
                          <span className="text-muted-foreground">{formatTRDate(v.visitDate)}</span>
                          <span className="text-muted-foreground">{VISIT_TYPE_LABELS[v.visitType]}</span>
                          <span className="font-mono text-xs text-muted-foreground">{visitCode(v.id)}</span>
                          <Link
                            href={`/ziyaret/${v.id}`}
                            className="ml-auto text-xs underline print:hidden"
                          >
                            Aç
                          </Link>
                        </summary>
                        <div className="border-t p-4">
                          <VisitRecord visit={v} showHeader={false} />
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
