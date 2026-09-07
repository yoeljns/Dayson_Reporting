import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  Plus,
  FileEdit,
  AlertTriangle,
  Swords,
  Boxes,
  ClipboardList,
  CalendarCheck,
  Search,
  Play,
} from "lucide-react";
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
import { DoneCard } from "@/components/done-card";
import { surveyMatches } from "@/lib/rules/survey";
import { VISIT_TYPE_LABELS, COMPANY_KIND_LABELS, type CompanyKind } from "@/lib/enums";
import type { Survey } from "@/types/db";

type PlanItemRow = {
  id: string;
  company_id: string;
  planned_date: string | null;
  visit_type: string | null;
  note: string | null;
  companies: { name: string; kind: CompanyKind } | { name: string; kind: CompanyKind }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function HomePage() {
  const profile = await requireProfile();
  // Managers in management mode never see the reporting home — the dashboard is
  // their landing screen. One tap on the header switch brings this page back.
  if (isManagementMode(profile)) redirect("/admin");

  const supabase = createClient();
  const today = todayIso();
  const thisWeek = currentWeekStart();
  const isSalesperson = profile.role === "salesperson";

  const [
    { data: drafts },
    { count: todayCount },
    { data: plans },
    { data: todayPlanRaw },
    { data: todayVisits },
    { data: activeSurveys },
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
      .gte("week_start", shiftWeek(thisWeek, -1)),
    // Today's planned companies (this week's plan, any status).
    supabase
      .from("visit_plan_items")
      .select("id, company_id, planned_date, visit_type, note, companies(name, kind), visit_plans!inner(salesperson_id, week_start)")
      .eq("visit_plans.salesperson_id", profile.id)
      .eq("visit_plans.week_start", thisWeek)
      .eq("planned_date", today)
      .order("created_at"),
    supabase
      .from("visits")
      .select("company_id")
      .eq("salesperson_id", profile.id)
      .eq("visit_date", today)
      .is("deleted_at", null),
    supabase.from("surveys").select("*").eq("status", "aktif"),
    getEodReminder(),
    getPlanDeadline(),
  ]);

  const draftCount = drafts?.length ?? 0;
  const visitedToday = new Set((todayVisits ?? []).map((v) => v.company_id));
  const todayPlan = ((todayPlanRaw as unknown as PlanItemRow[] | null) ?? []).map((it) => ({
    ...it,
    company: one(it.companies),
    done: visitedToday.has(it.company_id),
  }));
  const surveys = ((activeSurveys as Survey[] | null) ?? []).filter((s) =>
    surveyMatches(s, { repId: profile.id, date: today })
  );

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

      <Suspense>
        <DoneCard />
      </Suspense>

      <div>
        <h1 className="text-xl font-semibold">
          Merhaba, {profile.full_name || "👋"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Bugün {todayCount ?? 0} ziyaret tamamlandı
          {todayPlan.length > 0 && ` · planda ${todayPlan.length} firma`}
        </p>
      </div>

      {/* Primary actions */}
      <div className="space-y-3">
        <Link href="/ziyaret/yeni" className="block">
          <Button size="lg" className="h-16 w-full justify-start text-lg">
            <Plus className="mr-3 h-6 w-6" />
            Yeni Ziyaret
          </Button>
        </Link>

        <div className="grid grid-cols-2 gap-2">
          <Link href="/sikayet/yeni" className="block">
            <Button variant="secondary" className="h-14 w-full flex-col gap-0.5 text-sm">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Yeni Şikayet
            </Button>
          </Link>
          <Link href="/rakip/yeni" className="block">
            <Button variant="secondary" className="h-14 w-full flex-col gap-0.5 text-sm">
              <Swords className="h-5 w-5 text-primary" />
              Yeni Rakip Bilgisi
            </Button>
          </Link>
          <Link href="/stok/yeni" className="block">
            <Button variant="secondary" className="h-14 w-full flex-col gap-0.5 text-sm">
              <Boxes className="h-5 w-5 text-primary" />
              Yeni Stok Durumu
            </Button>
          </Link>
          <Link href="/anket" className="block">
            <Button variant="secondary" className="h-14 w-full flex-col gap-0.5 text-sm">
              <ClipboardList className="h-5 w-5 text-primary" />
              Özel Rapor
            </Button>
          </Link>
        </div>

        <Link
          href="/firmalar"
          className="flex items-center gap-2 rounded-md border bg-card p-3 text-sm text-muted-foreground hover:bg-accent"
        >
          <Search className="h-4 w-4" />
          Firma ara… (bayi, potansiyel bayi, diğer)
        </Link>
      </div>

      {/* Today's plan */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="section-label flex items-center gap-2">
            <CalendarCheck className="h-3.5 w-3.5" />
            Bugünün planı
          </CardTitle>
          <Link href="/plan" className="text-xs text-muted-foreground underline">
            Plan
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {todayPlan.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">
              Bugüne planlanmış firma yok.
            </p>
          ) : (
            todayPlan.map((it) => (
              <div
                key={it.id}
                className={`flex items-center justify-between gap-2 rounded-md border p-3 ${
                  it.done ? "bg-muted/30" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className={`font-medium ${it.done ? "line-through text-muted-foreground" : ""}`}>
                    {it.company?.name ?? "Firma"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.company ? COMPANY_KIND_LABELS[it.company.kind] : ""}
                    {it.visit_type
                      ? ` · ${VISIT_TYPE_LABELS[it.visit_type as keyof typeof VISIT_TYPE_LABELS]}`
                      : ""}
                    {it.note ? ` · ${it.note}` : ""}
                  </div>
                </div>
                {it.done ? (
                  <Badge variant="success">Yapıldı</Badge>
                ) : (
                  <Link href={`/ziyaret/yeni?company=${it.company_id}`}>
                    <Button size="sm">
                      <Play className="mr-1 h-3.5 w-3.5" /> Başlat
                    </Button>
                  </Link>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Drafts */}
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
              const company = one(d.companies as { name: string } | { name: string }[] | null);
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

      {/* Surveys */}
      {surveys.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="section-label flex items-center gap-2">
              <ClipboardList className="h-3.5 w-3.5" />
              Özel raporlar
            </CardTitle>
            <Badge variant="secondary">{surveys.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {surveys.slice(0, 4).map((s) => (
              <Link
                key={s.id}
                href={`/anket/${s.id}`}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="font-medium">{s.name}</div>
                  {s.description && (
                    <div className="truncate text-xs text-muted-foreground">{s.description}</div>
                  )}
                </div>
                <span className="text-xs text-primary">Doldur</span>
              </Link>
            ))}
            {surveys.length > 4 && (
              <Link href="/anket" className="block text-center text-xs underline">
                Tümü ({surveys.length})
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
