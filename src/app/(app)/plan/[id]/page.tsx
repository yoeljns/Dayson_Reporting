import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { weekRangeLabel, weekDayOptions, currentWeekStart } from "@/lib/week";
import { visitedInWeek } from "@/lib/plans/visited";
import { PlanEditor } from "@/components/plan-editor";
import type { PlanStatus } from "@/lib/enums";
import type { VisitType } from "@/lib/enums";

type ItemRow = {
  id: string;
  company_id: string;
  planned_date: string | null;
  visit_type: VisitType | null;
  note: string | null;
  companies: { name: string; city: string | null; segment: string | null } | null;
};

export default async function PlanDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: plan } = await supabase
    .from("visit_plans")
    .select(
      "id, salesperson_id, week_start, status, note, submitted_at, manager_note"
    )
    .eq("id", params.id)
    .single();

  if (!plan) notFound();

  const { data: itemsRaw } = await supabase
    .from("visit_plan_items")
    .select(
      "id, company_id, planned_date, visit_type, note, companies(name, city, segment)"
    )
    .eq("plan_id", params.id)
    .order("planned_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const items = ((itemsRaw as ItemRow[] | null) ?? []).map((it) => {
    const company = Array.isArray(it.companies)
      ? it.companies[0]
      : it.companies;
    return {
      id: it.id,
      companyId: it.company_id,
      companyName: company?.name ?? "Firma",
      city: company?.city ?? null,
      segment: company?.segment ?? null,
      plannedDate: it.planned_date,
      visitType: it.visit_type,
      note: it.note,
    };
  });

  // Last completed visit per planned company, to help time the next call.
  let lastVisit: Record<string, string | null> = {};
  const companyIds = items.map((i) => i.companyId);
  if (companyIds.length > 0) {
    const { data: lv } = await supabase
      .from("company_last_visit")
      .select("company_id, last_visit_date")
      .in("company_id", companyIds);
    lastVisit = Object.fromEntries(
      (lv ?? []).map((r) => [r.company_id, r.last_visit_date as string | null])
    );
  }

  const visited = await visitedInWeek(supabase, {
    salespersonId: plan.salesperson_id,
    weekStart: plan.week_start,
    companyIds,
  });

  const isOwner = plan.salesperson_id === profile.id;
  const pastWeek = plan.week_start < currentWeekStart();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link
        href="/plan"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Planlar
      </Link>

      <div>
        <h1 className="text-lg font-semibold">{weekRangeLabel(plan.week_start)}</h1>
        <p className="text-sm text-muted-foreground">Haftalık ziyaret planı</p>
      </div>

      <PlanEditor
        planId={plan.id}
        status={plan.status as PlanStatus}
        note={plan.note}
        managerNote={plan.manager_note}
        dayOptions={weekDayOptions(plan.week_start)}
        items={items}
        lastVisit={lastVisit}
        visited={visited}
        readOnly={!isOwner}
        lockedReason={
          pastWeek ? "Geçmiş haftaların planı değiştirilemez." : null
        }
      />
    </div>
  );
}
