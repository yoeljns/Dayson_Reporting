import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DrivingMode } from "@/components/driving-mode";
import { loadGlobalVoiceDictionary } from "@/lib/voice/dictionary";
import { listCompanyRefs } from "@/lib/companies/list";
import { todayIso, currentWeekStart } from "@/lib/week";

/**
 * Araç modu: hands-free voice notes between visits. One tap before driving,
 * then everything is spoken and read back; the note becomes a draft visit to
 * finish at the next stop.
 */
export default async function DrivingModePage() {
  const profile = await requireProfile();
  const supabase = createClient();
  const today = todayIso();
  const [dict, companies, { data: planRaw }] = await Promise.all([
    loadGlobalVoiceDictionary(supabase, profile.id),
    listCompanyRefs(supabase, {}, 400),
    supabase
      .from("visit_plan_items")
      .select("company_id, planned_date, companies(name, kind), visit_plans!inner(salesperson_id, week_start)")
      .eq("visit_plans.salesperson_id", profile.id)
      .eq("visit_plans.week_start", currentWeekStart())
      .eq("planned_date", today)
      .order("created_at"),
  ]);
  const plan = ((planRaw as unknown as {
    company_id: string;
    companies: { name: string; kind: string } | { name: string; kind: string }[] | null;
  }[] | null) ?? []).map((p) => {
    const c = Array.isArray(p.companies) ? p.companies[0] : p.companies;
    return { id: p.company_id, name: c?.name ?? "Firma", kind: c?.kind ?? "distributor" };
  });
  const { data: kinds } = companies.length
    ? await supabase.from("companies").select("id, kind").in("id", companies.map((c) => c.id))
    : { data: [] as { id: string; kind: string }[] };
  const kindOf = new Map(((kinds as { id: string; kind: string }[] | null) ?? []).map((k) => [k.id, k.kind]));

  return (
    <div className="mx-auto max-w-md space-y-3">
      <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Ana sayfa
      </Link>
      <DrivingMode
        dict={dict}
        today={today}
        plan={plan}
        companies={companies.map((c) => ({ id: c.id, name: c.name, kind: kindOf.get(c.id) ?? "distributor" }))}
      />
    </div>
  );
}
