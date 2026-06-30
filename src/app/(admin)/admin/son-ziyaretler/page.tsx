import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { LastVisitTable, type LastVisitRow } from "@/components/last-visit-table";

export default async function ManagerLastVisitsPage() {
  await requireManager();
  const supabase = createClient();

  const [{ data: companies }, { data: assignments }, { data: profiles }, { data: lv }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, name, city, segment")
        .eq("kind", "distributor")
        .is("deleted_at", null)
        .order("name")
        .limit(5000),
      supabase.from("assignments").select("company_id, salesperson_id"),
      supabase.from("profiles").select("id, full_name"),
      supabase
        .from("company_last_visit")
        .select("company_id, last_visit_date, visit_count"),
    ]);

  const spName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const assignedTo = new Map(
    (assignments ?? []).map((a) => [a.company_id, a.salesperson_id])
  );
  const lastMap = new Map(
    (lv ?? []).map((r) => [
      r.company_id,
      { date: r.last_visit_date as string | null, count: (r.visit_count as number) ?? 0 },
    ])
  );

  const rows: LastVisitRow[] = (companies ?? []).map((c) => {
    const spId = assignedTo.get(c.id);
    return {
      companyId: c.id,
      name: c.name,
      city: c.city,
      segment: c.segment,
      salesperson: spId ? spName.get(spId) ?? null : null,
      lastVisit: lastMap.get(c.id)?.date ?? null,
      visitCount: lastMap.get(c.id)?.count ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Son Ziyaret Tarihleri</h1>
        <p className="text-sm text-muted-foreground">
          Tüm bayilerin en son ziyaret tarihi. En eski / hiç ziyaret edilmeyenler
          üstte — pazarlamacıya göre filtrelemek için arama kutusunu kullan.
        </p>
      </div>
      <LastVisitTable rows={rows} showSalesperson linkBase="/admin/ziyaretler" />
    </div>
  );
}
