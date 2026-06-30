import Link from "next/link";
import { CalendarClock, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLAN_STATUS_LABELS, type PlanStatus } from "@/lib/enums";
import { weekStartOf, shiftWeek, weekRangeLabel } from "@/lib/week";
import { getPlanDeadline } from "@/lib/settings";
import { PlanWeekPicker } from "@/components/plan-week-picker";
import { PlanDeadlineBanner } from "@/components/plan-deadline-banner";

type PlanRow = {
  id: string;
  week_start: string;
  status: PlanStatus;
  submitted_at: string | null;
  visit_plan_items: { count: number }[];
};

export default async function PlansPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data }, planDeadline] = await Promise.all([
    supabase
      .from("visit_plans")
      .select("id, week_start, status, submitted_at, visit_plan_items(count)")
      .eq("salesperson_id", profile.id)
      .order("week_start", { ascending: false }),
    getPlanDeadline(),
  ]);

  const plans = (data as PlanRow[] | null) ?? [];
  const isSalesperson = profile.role === "salesperson";
  const byWeek = new Map(plans.map((p) => [p.week_start, p]));

  const thisWeek = weekStartOf();
  // This week + the next five — the weeks a rep can plan ahead for.
  const upcoming = Array.from({ length: 6 }, (_, i) => shiftWeek(thisWeek, i)).map(
    (w) => {
      const p = byWeek.get(w);
      return {
        weekStart: w,
        label: weekRangeLabel(w),
        isCurrent: w === thisWeek,
        planId: p?.id ?? null,
        status: p?.status ?? null,
        count: p?.visit_plan_items?.[0]?.count ?? 0,
      };
    }
  );

  const past = plans
    .filter((p) => p.week_start < thisWeek)
    .map((p) => ({
      ...p,
      label: weekRangeLabel(p.week_start),
      count: p.visit_plan_items?.[0]?.count ?? 0,
    }));

  return (
    <div className="mx-auto max-w-md space-y-6">
      {isSalesperson && (
        <PlanDeadlineBanner
          enabled={planDeadline.enabled}
          weekday={planDeadline.weekday}
          hour={planDeadline.hour}
          minute={planDeadline.minute}
          plans={plans.map((p) => ({ week_start: p.week_start, status: p.status }))}
        />
      )}

      <div>
        <h1 className="text-lg font-semibold">Ziyaret Planı</h1>
        <p className="text-sm text-muted-foreground">
          Haftalık ziyaret planını oluştur, gönder; ilerideki haftalar için de
          plan yapabilirsin.
        </p>
      </div>

      <Link
        href="/son-ziyaretler"
        className="flex items-center justify-between rounded-md border border-l-4 border-l-primary p-3 text-sm hover:bg-accent"
      >
        <span className="flex items-center gap-2 font-medium">
          <History className="h-4 w-4" />
          Son ziyaret tarihleri
        </span>
        <span className="text-muted-foreground">Kimi ne zaman ziyaret ettin →</span>
      </Link>

      <section className="space-y-2">
        <h2 className="section-label flex items-center gap-2">
          <CalendarClock className="h-3.5 w-3.5" />
          Bu hafta ve sonrası
        </h2>
        <PlanWeekPicker weeks={upcoming} />
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-label">Geçmiş planlar</h2>
          <div className="space-y-2">
            {past.map((p) => (
              <Link key={p.id} href={`/plan/${p.id}`}>
                <Card className="hover:bg-accent">
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.count} firma
                      </div>
                    </div>
                    <Badge
                      variant={p.status === "gonderildi" ? "success" : "warning"}
                    >
                      {PLAN_STATUS_LABELS[p.status]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
