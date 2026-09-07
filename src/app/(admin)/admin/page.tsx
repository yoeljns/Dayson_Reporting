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

const STALE_DAYS = 30;
// Dealer/visit universe for one distributor network — far above any real count,
// so the coverage tallies below are effectively exact (not silently truncated).
const DEALER_CAP = 20000;

type OverdueRow = {
  id: string;
  title: string;
  due_date: string;
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
  const staleCutoff = isoDaysAgo(STALE_DAYS, today);

  const [
    { data: distributors },
    { data: assignments },
    { data: lastVisits },
    { data: salespeople },
    { count: pendingPlans },
    { count: overdueComplaints },
    { count: openComplaints },
    { count: todayVisits },
    { data: weekVisits },
    { data: weekPlans },
    { data: overdueList },
    { data: pendingPlanList },
    { data: allProfiles },
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
      .in("status", ["acik", "islemde"])
      .lt("due_date", today),
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
      .select("id, title, due_date, complainant_name, companies(name)")
      .eq("is_draft", false)
      .in("status", ["acik", "islemde"])
      .lt("due_date", today)
      .order("due_date", { ascending: true })
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
  ]);

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
  const assignedPerSp = new Map<string, number>();
  for (const a of assignments ?? []) {
    if (a.salesperson_id)
      assignedPerSp.set(
        a.salesperson_id,
        (assignedPerSp.get(a.salesperson_id) ?? 0) + 1
      );
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

  const team = (salespeople ?? []).map((sp) => ({
    id: sp.id,
    name: sp.full_name,
    assigned: assignedPerSp.get(sp.id) ?? 0,
    visits: visitsPerSp.get(sp.id) ?? 0,
    plan: planPerSp.get(sp.id) ?? null,
  }));

  const queues = [
    {
      label: "Onay bekleyen plan",
      value: pendingPlans ?? 0,
      href: "/admin/planlar?status=gonderildi",
      alert: false,
    },
    {
      label: "Geciken şikayet",
      value: overdueComplaints ?? 0,
      href: "/admin/sikayetler?overdue=1",
      alert: (overdueComplaints ?? 0) > 0,
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
      href: "/admin/bayiler",
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
  ];

  const quickReports = [
    {
      label: "Bu hafta ziyaretler",
      href: `/api/admin/raporlar?type=ziyaret&start=${weekStart}&end=${weekEnd}`,
    },
    { label: "Bu ay performans", href: "/api/admin/raporlar?type=performans" },
    { label: "Son 30 gün şikayet", href: "/api/admin/raporlar?type=sikayet" },
    { label: "Bayi kapsama", href: "/api/admin/raporlar?type=kapsama" },
  ];

  const overdue = (overdueList ?? []) as OverdueRow[];
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
        <div className="grid gap-3 sm:grid-cols-3">
          <FollowUpCard
            title="Geciken şikayetler"
            emptyText="Geciken şikayet yok."
            allHref="/admin/sikayetler"
          >
            {overdue.map((c) => {
              const company = Array.isArray(c.companies)
                ? c.companies[0]
                : c.companies;
              const days = daysSince(c.due_date) ?? 0;
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
                  <Badge variant="destructive" className="shrink-0">
                    {days} gün gecikti
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
                  <Badge variant="success" className="shrink-0">
                    Gönderildi
                  </Badge>
                </Link>
              );
            })}
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
                  <th className="p-2 text-right">Atanan bayi</th>
                  <th className="p-2 text-right">Bu hafta ziyaret</th>
                  <th className="p-2">Plan</th>
                </tr>
              </thead>
              <tbody>
                {team.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
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
                      <td className="p-2 text-right">{t.assigned}</td>
                      <td className="p-2 text-right">{t.visits}</td>
                      <td className="p-2">
                        {t.plan === "gonderildi" ? (
                          <Badge variant="success">Gönderildi</Badge>
                        ) : t.plan === "taslak" ? (
                          <Badge variant="warning">Taslak</Badge>
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
