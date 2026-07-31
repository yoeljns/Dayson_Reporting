import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, FileEdit, AlertTriangle, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { isManagementMode } from "@/lib/ui-mode";
import { getEodReminder, getPlanDeadline } from "@/lib/settings";
import { todayIso, currentWeekStart, shiftWeek } from "@/lib/week";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EodReminderBanner } from "@/components/eod-reminder-banner";
import { PlanDeadlineBanner } from "@/components/plan-deadline-banner";
import { VISIT_TYPE_LABELS } from "@/lib/enums";

export default async function HomePage() {
  const profile = await requireProfile();
  // Managers in management mode never see the reporting home — the dashboard is
  // their landing screen. One tap on the header switch brings this page back.
  if (isManagementMode(profile)) redirect("/admin");

  const supabase = createClient();
  const today = todayIso();
  const isSalesperson = profile.role === "salesperson";

  const [
    { data: drafts },
    { count: todayCount },
    { data: plans },
    eod,
    planDeadline,
  ] = await Promise.all([
    supabase
      .from("visits")
      .select("id, visit_type, visit_date, created_at, companies(name, kind)")
      .eq("status", "taslak")
      .eq("salesperson_id", profile.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("status", "tamamlandi")
      .eq("salesperson_id", profile.id)
      .eq("visit_date", today)
      .is("deleted_at", null),
    supabase
      .from("visit_plans")
      .select("week_start, status")
      .eq("salesperson_id", profile.id)
      .gte("week_start", shiftWeek(currentWeekStart(), -1)),
    getEodReminder(),
    getPlanDeadline(),
  ]);

  const draftCount = drafts?.length ?? 0;

  return (
    <div className="space-y-5">
      <EodReminderBanner
        enabled={eod.enabled}
        hour={eod.hour}
        minute={eod.minute}
        draftCount={draftCount}
      />

      {isSalesperson && (
        <PlanDeadlineBanner
          enabled={planDeadline.enabled}
          weekday={planDeadline.weekday}
          hour={planDeadline.hour}
          minute={planDeadline.minute}
          plans={
            (plans as { week_start: string; status: string }[] | null) ?? []
          }
        />
      )}

      <div>
        <h1 className="text-xl font-semibold">
          Merhaba, {profile.full_name || "👋"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Bugün {todayCount ?? 0} ziyaret tamamlandı
        </p>
      </div>

      {/* Primary actions — stacked "new" launcher */}
      <div className="space-y-3">
        <Link href="/ziyaret/yeni" className="block">
          <Button size="lg" className="h-16 w-full justify-start text-lg">
            <Plus className="mr-3 h-6 w-6" />
            Yeni Ziyaret
          </Button>
        </Link>

        <Link href="/sikayet/yeni" className="block">
          <Button
            size="lg"
            variant="secondary"
            className="h-14 w-full justify-start text-base"
          >
            <AlertTriangle className="mr-3 h-5 w-5 text-amber-600" />
            Yeni Şikayet
          </Button>
        </Link>

        <Link href="/rakip/yeni" className="block">
          <Button
            size="lg"
            variant="secondary"
            className="h-14 w-full justify-start text-base"
          >
            <Swords className="mr-3 h-5 w-5 text-primary" />
            Yeni Rakip Bilgisi
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="section-label flex items-center gap-2">
            <FileEdit className="h-3.5 w-3.5" />
            Tamamlanmamış Ziyaretler
          </CardTitle>
          {draftCount > 0 && <Badge variant="warning">{draftCount}</Badge>}
        </CardHeader>
        <CardContent className="space-y-2">
          {draftCount === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Bekleyen taslak yok. 🎉
            </p>
          ) : (
            drafts!.map((d) => {
              const company = Array.isArray(d.companies)
                ? d.companies[0]
                : (d.companies as { name: string } | null);
              return (
                <Link
                  key={d.id}
                  href={`/ziyaret/${d.id}`}
                  className="flex items-center justify-between rounded-md border border-l-4 border-l-[hsl(var(--gold))] p-3 hover:bg-accent"
                >
                  <div>
                    <div className="font-medium">
                      {company?.name ?? "Firma"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {VISIT_TYPE_LABELS[d.visit_type as keyof typeof VISIT_TYPE_LABELS]} · {d.visit_date}
                    </div>
                  </div>
                  <Badge variant="warning">Taslak</Badge>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
