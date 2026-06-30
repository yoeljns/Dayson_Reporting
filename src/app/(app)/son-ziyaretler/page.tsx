import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { LastVisitTable, type LastVisitRow } from "@/components/last-visit-table";

type AssignRow = {
  companies:
    | { id: string; name: string; city: string | null; segment: string | null }
    | { id: string; name: string; city: string | null; segment: string | null }[]
    | null;
};

export default async function MyLastVisitsPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: assigns } = await supabase
    .from("assignments")
    .select("companies(id, name, city, segment)")
    .eq("salesperson_id", profile.id);

  const companies = ((assigns as AssignRow[] | null) ?? [])
    .map((a) => (Array.isArray(a.companies) ? a.companies[0] : a.companies))
    .filter(
      (c): c is { id: string; name: string; city: string | null; segment: string | null } =>
        !!c
    );

  let lastMap: Record<string, { date: string | null; count: number }> = {};
  if (companies.length > 0) {
    const { data: lv } = await supabase
      .from("company_last_visit")
      .select("company_id, last_visit_date, visit_count")
      .in(
        "company_id",
        companies.map((c) => c.id)
      );
    lastMap = Object.fromEntries(
      (lv ?? []).map((r) => [
        r.company_id,
        { date: r.last_visit_date as string | null, count: (r.visit_count as number) ?? 0 },
      ])
    );
  }

  const rows: LastVisitRow[] = companies.map((c) => ({
    companyId: c.id,
    name: c.name,
    city: c.city,
    segment: c.segment,
    lastVisit: lastMap[c.id]?.date ?? null,
    visitCount: lastMap[c.id]?.count ?? 0,
  }));

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link
        href="/plan"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Plan
      </Link>
      <div>
        <h1 className="text-lg font-semibold">Son Ziyaret Tarihleri</h1>
        <p className="text-sm text-muted-foreground">
          Müşterilerini en son ne zaman ziyaret ettin? En eskiler üstte.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sana atanmış bayi yok.
        </p>
      ) : (
        <LastVisitTable rows={rows} linkBase="/ziyaretler" />
      )}
    </div>
  );
}
