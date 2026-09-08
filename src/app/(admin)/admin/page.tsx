import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  currentWeekStart,
  weekEndOf,
  weekRangeLabel,
  todayIso,
  isoDaysAgo,
  daysSince,
  formatTRDate,
} from "@/lib/week";
import { groupAssignments, repsLabel } from "@/lib/assignments";
import { getStaleDays, getPaceThresholds } from "@/lib/settings";
import { targetsForYear } from "@/lib/targets/server";
import { buildTargetStatus, fmtQtyUnit, fmtUnit } from "@/lib/rules/target";
import { loadSalesCategories, shipmentTotalsForYear } from "@/lib/sales/server";
import { PaceBadge } from "@/components/target-view";
import { stockCountCode } from "@/lib/codes";
import {
  PLAN_STATUS_LABELS,
  PLAN_STATUS_BADGE,
  COMPANY_KIND_LABELS,
  type PlanStatus,
  type CompanyKind,
} from "@/lib/enums";

// Dealer/visit universe for one distributor network — far above any real count,
// so the coverage tallies below are effectively exact (not silently truncated).
const DEALER_CAP = 20000;

type RecentComplaintRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  complainant_name: string | null;
  companies: { name: string } | { name: string }[] | null;
};

type PendingPlanRow = {
  id: string;
  week_start: string;
  salesperson: { full_name: string } | { full_name: string }[] | null;
  visit_plan_items: { count: number }[];
};

export default async function ManagerDashboardPage() {
  await requireManager();
  const supabase = createClient();

  // Anchor all "today"/week logic to the team's timezone (see week.ts).
  const today = todayIso();
  const weekStart = currentWeekStart();
  const weekEnd = weekEndOf(weekStart);
  const [STALE_DAYS, paceThresholds] = await Promise.all([getStaleDays(), getPaceThresholds()]);
  const staleCutoff = isoDaysAgo(STALE_DAYS, today);
  const year = Number(today.slice(0, 4));

  const [
    { data: distributors },
    { data: assignments },
    { data: lastVisits },
    { data: salespeople },
    { count: pendingPlans },
    { count: weekComplaints },
    { count: openComplaints },
    { count: todayVisits },
    { data: weekVisits },
    { data: weekPlans },
    { data: recentComplaintList },
    { data: pendingPlanList },
    { data: allProfiles },
    { data: fieldCompanies },
    { count: surveyAnswersWeek },
    { data: recentCounts },
    targets,
    shipmentsByCompany,
    salesCats,
    { data: todayPlanItems },
    { data: todayVisitRows },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name")
      .eq("kind", "distributor")
      .is("deleted_at", null)
      .limit(DEALER_CAP),
    supabase
      .from("assignments")
      .select("company_id, salesperson_id, role")
      .limit(DEALER_CAP),
    supabase
      .from("company_last_visit")
      .select("company_id, last_visit_date")
      .limit(DEALER_CAP),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .eq("role", "salesperson")
      .order("full_name"),
    // Submitted plans for this week and beyond — what the manager still reviews.
    supabase
      .from("visit_plans")
      .select("id", { count: "exact", head: true })
      .eq("status", "gonderildi")
      .gte("week_start", weekStart),
    supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("is_draft", false)
      .gte("created_at", `${weekStart}T00:00:00`),
    supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("is_draft", false)
      .in("status", ["acik", "islemde"]),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("status", "tamamlandi")
      .eq("visit_date", today)
      .is("deleted_at", null),
    supabase
      .from("visits")
      .select("salesperson_id")
      .eq("status", "tamamlandi")
      .is("deleted_at", null)
      .gte("visit_date", weekStart)
      .lte("visit_date", weekEnd)
      .limit(DEALER_CAP),
    supabase
      .from("visit_plans")
      .select("salesperson_id, status")
      .eq("week_start", weekStart),
    // Follow-up lists: the first records behind the counts.
    supabase
      .from("complaints")
      .select("id, title, status, created_at, complainant_name, companies(name)")
      .eq("is_draft", false)
      .in("status", ["acik", "islemde"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("visit_plans")
      .select(
        "id, week_start, salesperson:salesperson_id(full_name), visit_plan_items(count)"
      )
      .eq("status", "gonderildi")
      .gte("week_start", weekStart)
      .order("week_start", { ascending: true })
      .order("submitted_at", { ascending: true })
      .limit(5),
    // ALL profiles (incl. deactivated/managers) so assignment labels never show
    // "Atanmamış" for a dealer that is actually assigned to a deactivated rep.
    supabase.from("profiles").select("id, full_name"),
    // Companies registered from the field this week.
    supabase
      .from("companies")
      .select("id, name, kind, city, created_by, created_at")
      .neq("kind", "distributor")
      .is("deleted_at", null)
      .gte("created_at", `${weekStart}T00:00:00`)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("survey_answers")
      .select("id", { count: "exact", head: true })
      .gte("answered_at", weekStart)
      .lte("answered_at", weekEnd),
    supabase
      .from("stock_counts")
      .select("id, counted_at, company_id, companies(name), salesperson:salesperson_id(full_name), stock_count_lines(pallets)")
      .order("counted_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
    targetsForYear(supabase, year),
    shipmentTotalsForYear(supabase, year),
    loadSalesCategories(supabase),
    // Today's planned items (this week's plans) — for plan adherence per rep.
    supabase
      .from("visit_plan_items")
      .select("company_id, visit_plans!inner(salesperson_id, week_start)")
      .eq("visit_plans.week_start", weekStart)
      .eq("planned_date", today)
      .limit(DEALER_CAP),
    supabase
      .from("visits")
      .select("salesperson_id, company_id")
      .eq("visit_date", today)
      .is("deleted_at", null)
      .limit(DEALER_CAP),
  ]);

  // Plan adherence: planned today vs. actually visited today, per rep.
  const plannedToday = new Map<string, Set<string>>();
  for (const it of (todayPlanItems ?? []) as unknown as {
    company_id: string;
    visit_plans: { salesperson_id: string } | { salesperson_id: string }[] | null;
  }[]) {
    const vp = Array.isArray(it.visit_plans) ? it.visit_plans[0] : it.visit_plans;
    if (!vp) continue;
    (plannedToday.get(vp.salesperson_id) ?? plannedToday.set(vp.salesperson_id, new Set()).get(vp.salesperson_id)!).add(it.company_id);
  }
  const visitedToday = new Map<string, Set<string>>();
  for (const v of todayVisitRows ?? []) {
    (visitedToday.get(v.salesperson_id) ?? visitedToday.set(v.salesperson_id, new Set()).get(v.salesperson_id)!).add(v.company_id);
  }

  // Dealers with at least one category behind target (most behind first).
  const dealerName = new Map(((distributors ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]));
  const behindTargets = Array.from(targets.values())
    .filter((t) => t.status !== "iptal")
    .map((t) => {
      const st = buildTargetStatus(
        t.lines,
        salesCats,
        shipmentsByCompany.get(t.company_id) ?? null,
        year,
        today,
        paceThresholds
      );
      const worst =
        st.lines
          .filter((l) => l.pace.pace === "geride")
          .sort((x, y) => (x.pace.paceRatio ?? 0) - (y.pace.paceRatio ?? 0))[0] ?? null;
      return { t, st, worst };
    })
    .filter((x) => x.st.pace === "geride")
    .sort(
      (x, y) =>
        y.st.behind / Math.max(1, y.st.withTarget) - x.st.behind / Math.max(1, x.st.withTarget) ||
        (x.worst?.pace.paceRatio ?? 0) - (y.worst?.pace.paceRatio ?? 0)
    );

  // Dealer coverage: which distributors are unassigned or long-unvisited.
  const assignedTo = groupAssignments(assignments);
  const lastVisitMap = new Map(
    (lastVisits ?? []).map((r) => [
      r.company_id,
      r.last_visit_date as string | null,
    ])
  );
  const spName = new Map((allProfiles ?? []).map((p) => [p.id, p.full_name]));
  const dealers = (distributors ?? []) as { id: string; name: string }[];
  const unassignedCount = dealers.filter((c) => !assignedTo.has(c.id)).length;
  const staleDealers = dealers
    .map((c) => ({ ...c, last: lastVisitMap.get(c.id) ?? null }))
    .filter((c) => c.last === null || c.last <= staleCutoff)
    .sort((a, b) => {
      if (a.last === b.last) return a.name.localeCompare(b.name, "tr");
      if (a.last === null) return -1; // never visited first
      if (b.last === null) return 1;
      return a.last < b.last ? -1 : 1; // oldest first
    });

  // Per-salesperson tallies for the team summary.
  const assignedPerSp = new Map<string, { owner: number; backup: number }>();
  for (const a of assignments ?? []) {
    if (!a.salesperson_id) continue;
    const cur = assignedPerSp.get(a.salesperson_id) ?? { owner: 0, backup: 0 };
    if ((a.role ?? "owner") === "owner") cur.owner++;
    else cur.backup++;
    assignedPerSp.set(a.salesperson_id, cur);
  }
  const visitsPerSp = new Map<string, number>();
  for (const v of weekVisits ?? []) {
    if (v.salesperson_id)
      visitsPerSp.set(
        v.salesperson_id,
        (visitsPerSp.get(v.salesperson_id) ?? 0) + 1
      );
  }
  const planPerSp = new Map<string, string>();
  for (const p of weekPlans ?? []) {
    if (p.salesperson_id) planPerSp.set(p.salesperson_id, p.status as string);
  }

  const team = (salespeople ?? []).map((sp) => {
    const planned = plannedToday.get(sp.id) ?? new Set<string>();
    const visited = visitedToday.get(sp.id) ?? new Set<string>();
    let done = 0;
    planned.forEach((c) => {
      if (visited.has(c)) done++;
    });
    return {
      id: sp.id,
      name: sp.full_name,
      assigned: assignedPerSp.get(sp.id) ?? { owner: 0, backup: 0 },
      visits: visitsPerSp.get(sp.id) ?? 0,
      plan: (planPerSp.get(sp.id) as PlanStatus | undefined) ?? null,
      plannedToday: planned.size,
      doneToday: done,
    };
  });

  const queues = [
    {
      label: "Onay bekleyen plan",
      value: pendingPlans ?? 0,
      href: "/admin/planlar?status=gonderildi",
      alert: false,
    },
    {
      label: "Bu hafta açılan şikayet",
      value: weekComplaints ?? 0,
      href: "/admin/sikayetler",
      alert: false,
    },
    {
      label: "Açık şikayet",
      value: openComplaints ?? 0,
      href: "/admin/sikayetler",
      alert: false,
    },
    {
      label: "Atanmamış bayi",
      value: unassignedCount,
      href: "/admin/firmalar?tur=distributor&atama=yok",
      alert: unassignedCount > 0,
    },
    {
      label: `${STALE_DAYS}+ gün ziyaretsiz bayi`,
      value: staleDealers.length,
      href: "/admin/son-ziyaretler",
      alert: false,
    },
    {
      label: "Bugün tamamlanan ziyaret",
      value: todayVisits ?? 0,
      href: `/admin/ziyaretler?status=tamamlandi&date=${today}`,
      alert: false,
    },
    {
      label: "Sahadan eklenen firma (bu hafta)",
      value: fieldCompanies?.length ?? 0,
      href: "/admin/firmalar",
      alert: false,
    },
    {
      label: "Özel rapor cevabı (bu hafta)",
      value: surveyAnswersWeek ?? 0,
      href: "/admin/anketler",
      alert: false,
    },
  ];

  const quickReports = [
    {
      label: "Bu hafta ziyaretler",
      href: `/api/admin/raporlar?type=ziyaret&start=${weekStart}&end=${weekEnd}`,
    },
    { label: "Bu ay performans", href: "/api/admin/raporlar?type=performans" },
    { label: "Son 30 gün şikayet", href: "/api/admin/raporlar?type=sikayet" },
    { label: "Bayi kapsama", href: "/api/admin/raporlar?type=kapsama" },
    { label: "Stok durumu", href: "/api/admin/raporlar?type=stok" },
    { label: `Hedefler ${year}`, href: `/api/admin/raporlar?type=hedef&year=${year}` },
  ];

  const recentComplaints = (recentComplaintList ?? []) as RecentComplaintRow[];
  const pending = (pendingPlanList ?? []) as PendingPlanRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">İş Panosu</h1>
        <p className="text-sm text-muted-foreground">
          Bu hafta ({weekRangeLabel(weekStart)}) ekibin durumu ve bekleyen işler.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Bekleyen işler
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
          {queues.map((q) => (
            <Link key={q.label} href={q.href}>
              <Card
                className={cn(
                  "h-full hover:bg-accent",
                  q.alert && "border-destructive/50"
                )}
              >
                <CardContent className="p-4">
                  <div
                    className={cn(
                      "text-3xl font-bold",
                      q.alert && "text-destructive"
                    )}
                  >
                    {q.value}
                  </div>
                  <div className="text-sm text-muted-foreground">{q.label}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Takip</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FollowUpCard
            title="Açık şikayetler (en yeni)"
            emptyText="Açık şikayet yok."
            allHref="/admin/sikayetler"
          >
            {recentComplaints.map((c) => {
              const company = Array.isArray(c.companies)
                ? c.companies[0]
                : c.companies;
              const days = daysSince(c.created_at.slice(0, 10)) ?? 0;
              return (
                <Link
                  key={c.id}
                  href={`/sikayet/${c.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {c.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {company?.name || c.complainant_name || "—"}
                    </span>
                  </span>
                  <Badge variant={c.status === "islemde" ? "default" : "warning"} className="shrink-0">
                    {days} gündür açık
                  </Badge>
                </Link>
              );
            })}
          </FollowUpCard>

          <FollowUpCard
            title="En uzun süredir ziyaretsiz bayiler"
            emptyText={`${STALE_DAYS}+ gün ziyaretsiz bayi yok.`}
            allHref="/admin/son-ziyaretler"
          >
            {staleDealers.slice(0, 5).map((d) => {
              const spLabel = repsLabel(assignedTo.get(d.id), (id) =>
                spName.get(id)
              );
              return (
                <Link
                  key={d.id}
                  href={`/admin/bayi/${d.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {d.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {spLabel}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.last
                      ? `${daysSince(d.last) ?? 0} gün önce`
                      : "Hiç ziyaret yok"}
                  </span>
                </Link>
              );
            })}
          </FollowUpCard>

          <FollowUpCard
            title="Onay bekleyen planlar"
            emptyText="Onay bekleyen plan yok."
            allHref="/admin/planlar?status=gonderildi"
          >
            {pending.map((p) => {
              const sp = Array.isArray(p.salesperson)
                ? p.salesperson[0]
                : p.salesperson;
              const count = p.visit_plan_items?.[0]?.count ?? 0;
              return (
                <Link
                  key={p.id}
                  href={`/admin/planlar/${p.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {sp?.full_name ?? "—"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {weekRangeLabel(p.week_start)} · {count} firma
                    </span>
                  </span>
                  <Badge variant="default" className="shrink-0">
                    Onay bekliyor
                  </Badge>
                </Link>
              );
            })}
          </FollowUpCard>

          <FollowUpCard
            title="Son stok sayımları"
            emptyText="Henüz stok sayımı yok."
            allHref="/admin/stok"
          >
            {((recentCounts ?? []) as unknown as {
              id: string;
              counted_at: string;
              company_id: string;
              companies: { name: string } | { name: string }[] | null;
              salesperson: { full_name: string } | { full_name: string }[] | null;
              stock_count_lines: { pallets: number }[] | null;
            }[]).map((c) => {
              const co = Array.isArray(c.companies) ? c.companies[0] : c.companies;
              const sp = Array.isArray(c.salesperson) ? c.salesperson[0] : c.salesperson;
              const total = (c.stock_count_lines ?? []).reduce((a, l) => a + Number(l.pallets), 0);
              return (
                <Link
                  key={c.id}
                  href={`/admin/bayi/${c.company_id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{co?.name ?? "Bayi"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatTRDate(c.counted_at)} · {sp?.full_name ?? "—"} · {stockCountCode(c.id)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {total.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} palet
                  </span>
                </Link>
              );
            })}
          </FollowUpCard>

          <FollowUpCard
            title={`Hedefte geride kalan bayiler (${year})`}
            emptyText="Hedefin gerisinde bayi yok."
            allHref={`/admin/hedefler?year=${year}`}
          >
            {behindTargets.slice(0, 5).map(({ t, st, worst }) => (
              <Link
                key={t.id}
                href={`/admin/hedefler/${t.company_id}/${year}`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {dealerName.get(t.company_id) ?? "Bayi"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {st.behind}/{st.withTarget} kategori geride
                    {worst
                      ? ` · ${worst.category.label_tr} ${fmtQtyUnit(worst.shipped, worst.category.unit)}/${fmtUnit(
                          worst.target,
                          worst.category.unit
                        )}`
                      : ""}
                  </span>
                </span>
                <PaceBadge pace={st.pace} />
              </Link>
            ))}
          </FollowUpCard>

          <FollowUpCard
            title="Sahadan eklenen firmalar (bu hafta)"
            emptyText="Bu hafta sahadan firma eklenmedi."
            allHref="/admin/firmalar"
          >
            {((fieldCompanies ?? []) as { id: string; name: string; kind: CompanyKind; city: string | null; created_by: string | null }[])
              .slice(0, 5)
              .map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/bayi/${c.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {COMPANY_KIND_LABELS[c.kind]}
                      {c.city ? ` · ${c.city}` : ""} · {c.created_by ? spName.get(c.created_by) ?? "—" : "—"}
                    </span>
                  </span>
                </Link>
              ))}
          </FollowUpCard>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Ekip özeti (bu hafta)
        </h2>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-2">Pazarlamacı</th>
                  <th className="p-2 text-right" title="Sorumlu olduğu bayi (+ yedek olduğu)">
                    Atanan bayi
                  </th>
                  <th className="p-2 text-right">Bu hafta ziyaret</th>
                  <th className="p-2 text-right" title="Bugüne planlanan / yapılan">
                    Bugünkü plan
                  </th>
                  <th className="p-2">Haftalık plan</th>
                </tr>
              </thead>
              <tbody>
                {team.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-6 text-center text-muted-foreground"
                    >
                      Aktif pazarlamacı yok.
                    </td>
                  </tr>
                ) : (
                  team.map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">
                        <Link
                          href={`/admin/pazarlamaci/${t.id}`}
                          className="hover:underline"
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {t.assigned.owner}
                        {t.assigned.backup > 0 && (
                          <span className="text-muted-foreground"> +{t.assigned.backup}</span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">{t.visits}</td>
                      <td className="p-2 text-right tabular-nums">
                        {t.plannedToday === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={t.doneToday >= t.plannedToday ? "text-[hsl(var(--success))]" : ""}>
                            {t.doneToday} / {t.plannedToday}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {t.plan ? (
                          <Badge variant={PLAN_STATUS_BADGE[t.plan]}>{PLAN_STATUS_LABELS[t.plan]}</Badge>
                        ) : (
                          <Badge variant="secondary">Yok</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Hızlı raporlar (Excel)
          </h2>
          <div className="flex gap-3 text-sm">
            <Link href="/admin/haftalik" className="text-primary hover:underline">
              Haftalık özet (plan + raporlar) →
            </Link>
            <Link href="/admin/raporlar" className="text-primary hover:underline">
              Tüm raporlar →
            </Link>
            <Link href="/admin/bayiler" className="text-primary hover:underline">
              Yeni bayi ekle
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickReports.map((r) => (
            <a
              key={r.label}
              href={r.href}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              <Download className="h-4 w-4" />
              {r.label}
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Bugün: {formatTRDate(today)} · Rapor dosyaları Excel (.xlsx) olarak iner.
        </p>
      </section>
    </div>
  );
}

function FollowUpCard({
  title,
  emptyText,
  allHref,
  children,
}: {
  title: string;
  emptyText: string;
  allHref: string;
  children: React.ReactNode;
}) {
  const isEmpty = Array.isArray(children)
    ? children.length === 0
    : children == null;
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-sm font-medium">{title}</span>
          <Link
            href={allHref}
            className="text-xs text-primary hover:underline"
          >
            Tümü →
          </Link>
        </div>
        {isEmpty ? (
          <p className="px-2 pb-1 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
