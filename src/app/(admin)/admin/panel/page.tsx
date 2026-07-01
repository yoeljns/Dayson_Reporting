import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { weekStartOf, weekEndOf, weekRangeLabel, daysSince } from "@/lib/week";

const STALE_DAYS = 30;

export default async function ManagerPanelPage() {
  await requireManager();
  const supabase = createClient();

  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartOf();
  const weekEnd = weekEndOf(weekStart);

  const [
    { data: distributors },
    { data: assignments },
    { data: lastVisits },
    { data: salespeople },
    { count: pendingPlans },
    { count: overdueComplaints },
    { count: openComplaints },
    { data: weekVisits },
    { data: weekPlans },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id")
      .eq("kind", "distributor")
      .is("deleted_at", null)
      .limit(5000),
    supabase.from("assignments").select("company_id, salesperson_id"),
    supabase.from("company_last_visit").select("company_id, last_visit_date"),
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
      .select("salesperson_id")
      .eq("status", "tamamlandi")
      .is("deleted_at", null)
      .gte("visit_date", weekStart)
      .lte("visit_date", weekEnd)
      .limit(10000),
    supabase
      .from("visit_plans")
      .select("salesperson_id, status")
      .eq("week_start", weekStart),
  ]);

  // Dealer coverage: which distributors are unassigned or long-unvisited.
  const assignedCompanyIds = new Set(
    (assignments ?? []).map((a) => a.company_id)
  );
  const lastVisitMap = new Map(
    (lastVisits ?? []).map((r) => [
      r.company_id,
      r.last_visit_date as string | null,
    ])
  );
  const dealers = distributors ?? [];
  const unassignedCount = dealers.filter(
    (c) => !assignedCompanyIds.has(c.id)
  ).length;
  const staleCount = dealers.filter((c) => {
    const last = lastVisitMap.get(c.id) ?? null;
    const ds = daysSince(last);
    return last === null || (ds !== null && ds >= STALE_DAYS);
  }).length;

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
      href: "/admin/sikayetler?status=acik",
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
      value: staleCount,
      href: "/admin/son-ziyaretler",
      alert: false,
    },
  ];

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Ekip özeti (bu hafta)
          </h2>
          <Link
            href="/admin/raporlar"
            className="text-sm text-primary hover:underline"
          >
            Raporlar →
          </Link>
        </div>
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
                      <td className="p-2 font-medium">{t.name}</td>
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
    </div>
  );
}
