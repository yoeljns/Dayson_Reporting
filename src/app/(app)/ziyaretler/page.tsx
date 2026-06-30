import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  VISIT_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_STATUSES,
  type VisitStatus,
} from "@/lib/enums";
import { cn } from "@/lib/utils";

export default async function VisitsListPage({
  searchParams,
}: {
  searchParams: { status?: string; company?: string };
}) {
  await requireProfile();
  const supabase = createClient();
  const statusFilter = VISIT_STATUSES.includes(
    searchParams.status as VisitStatus
  )
    ? (searchParams.status as VisitStatus)
    : undefined;
  const companyFilter = searchParams.company;

  let query = supabase
    .from("visits")
    .select("id, visit_type, status, visit_date, companies(name)")
    .is("deleted_at", null)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (companyFilter) query = query.eq("company_id", companyFilter);

  const { data: visits } = await query;

  // Header for a company-scoped history view.
  let companyName: string | null = null;
  if (companyFilter) {
    const { data: c } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyFilter)
      .maybeSingle();
    companyName = (c as { name: string } | null)?.name ?? null;
  }

  const filters: Array<{ key?: VisitStatus; label: string }> = [
    { label: "Tümü" },
    { key: "taslak", label: "Taslak" },
    { key: "tamamlandi", label: "Tamamlandı" },
  ];

  const companyQs = companyFilter
    ? `&company=${encodeURIComponent(companyFilter)}`
    : "";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">
        {companyName ? `${companyName} — Ziyaretler` : "Ziyaretlerim"}
      </h1>

      {companyFilter && (
        <Link
          href="/ziyaretler"
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Tüm ziyaretler
        </Link>
      )}

      <div className="flex gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={
              f.key
                ? `/ziyaretler?status=${f.key}${companyQs}`
                : `/ziyaretler${companyFilter ? `?company=${encodeURIComponent(companyFilter)}` : ""}`
            }
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              (f.key ?? undefined) === statusFilter
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {!visits || visits.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ziyaret bulunamadı.
          </p>
        ) : (
          visits.map((v) => {
            const company = Array.isArray(v.companies)
              ? v.companies[0]
              : (v.companies as { name: string } | null);
            return (
              <Link key={v.id} href={`/ziyaret/${v.id}`}>
                <Card className="hover:bg-accent">
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium">{company?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {VISIT_TYPE_LABELS[v.visit_type as keyof typeof VISIT_TYPE_LABELS]}{" "}
                        · {v.visit_date}
                      </div>
                    </div>
                    <Badge
                      variant={v.status === "taslak" ? "warning" : "success"}
                    >
                      {VISIT_STATUS_LABELS[v.status as keyof typeof VISIT_STATUS_LABELS]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
