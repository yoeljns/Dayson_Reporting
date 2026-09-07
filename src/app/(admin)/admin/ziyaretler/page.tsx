import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { VisitHistoryControls } from "@/components/visit-history-controls";
import { AdminVisitDeleteButton } from "@/components/admin-visit-delete-button";
import {
  VISIT_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_STATUSES,
  type VisitType,
  type VisitStatus,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/week";

type Row = {
  id: string;
  visit_type: VisitType;
  status: VisitStatus;
  visit_date: string;
  company_id: string;
  companies: { name: string; city: string | null } | { name: string; city: string | null }[] | null;
  salesperson: { full_name: string } | { full_name: string }[] | null;
};

export default async function ManagerVisitHistoryPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    sp?: string;
    company?: string;
    q?: string;
    date?: string;
  };
}) {
  const profile = await requireManager();
  const isAdmin = profile.role === "admin" || profile.role === "manager";
  const supabase = createClient();

  const statusFilter = VISIT_STATUSES.includes(searchParams.status as VisitStatus)
    ? (searchParams.status as VisitStatus)
    : undefined;
  const spFilter = searchParams.sp ?? "";
  const companyFilter = searchParams.company ?? "";
  const q = (searchParams.q ?? "").trim();
  // Single-day filter (used by the dashboard's "Bugün tamamlanan ziyaret" card).
  const dateFilter = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? "")
    ? (searchParams.date as string)
    : "";

  let query = supabase
    .from("visits")
    .select(
      "id, visit_type, status, visit_date, company_id, companies(name, city), salesperson:salesperson_id(full_name)"
    )
    .is("deleted_at", null)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (spFilter) query = query.eq("salesperson_id", spFilter);
  if (companyFilter) query = query.eq("company_id", companyFilter);
  if (dateFilter) query = query.eq("visit_date", dateFilter);

  const [{ data: visits }, { data: profiles }] = await Promise.all([
    query,
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  let rows = (visits as Row[] | null) ?? [];
  // Free-text company filter is applied in-memory over the fetched window.
  if (q) {
    const t = q.toLowerCase();
    rows = rows.filter((v) => {
      const c = Array.isArray(v.companies) ? v.companies[0] : v.companies;
      return (c?.name ?? "").toLowerCase().includes(t);
    });
  }

  let companyName: string | null = null;
  if (companyFilter) {
    const { data: c } = await supabase
      .from("companies")
      .select("name")
      .eq("id", companyFilter)
      .maybeSingle();
    companyName = (c as { name: string } | null)?.name ?? null;
  }

  const buildHref = (
    status?: VisitStatus,
    opts?: { dropCompany?: boolean; dropDate?: boolean }
  ) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (spFilter) p.set("sp", spFilter);
    if (companyFilter && !opts?.dropCompany) p.set("company", companyFilter);
    if (dateFilter && !opts?.dropDate) p.set("date", dateFilter);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/admin/ziyaretler?${qs}` : "/admin/ziyaretler";
  };

  const filters: Array<{ key?: VisitStatus; label: string }> = [
    { label: "Tümü" },
    { key: "tamamlandi", label: "Tamamlandı" },
    { key: "taslak", label: "Taslak" },
  ];

  // Export honours the active filters. A single day maps to start=end=date.
  const exportParams = new URLSearchParams({ type: "ziyaret" });
  if (statusFilter) exportParams.set("status", statusFilter);
  if (spFilter) exportParams.set("sp", spFilter);
  if (companyFilter) exportParams.set("company", companyFilter);
  if (q) exportParams.set("q", q);
  if (dateFilter) {
    exportParams.set("start", dateFilter);
    exportParams.set("end", dateFilter);
  } else {
    // No day filter → export the whole history the page represents. Without an
    // explicit range the report defaults to the last 30 days, which would
    // silently drop older visits shown here.
    exportParams.set("start", "2000-01-01");
    exportParams.set("end", todayIso());
  }
  const exportHref = `/api/admin/raporlar?${exportParams.toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            {companyName ? `${companyName} — Ziyaret Geçmişi` : "Ziyaret Geçmişi"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Tüm ekibin ziyaret geçmişi (en yeni üstte, son 300 kayıt).
          </p>
        </div>
        <a
          href={exportHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Excel&apos;e Aktar
        </a>
      </div>

      {companyFilter && (
        <Link
          href={buildHref(statusFilter, { dropCompany: true })}
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Tüm firmalar
        </Link>
      )}

      {dateFilter && (
        <Link
          href={buildHref(statusFilter, { dropDate: true })}
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Tüm tarihler (şu an: {dateFilter})
        </Link>
      )}

      <VisitHistoryControls
        salespeople={(profiles as { id: string; full_name: string }[]) ?? []}
        initialSp={spFilter}
        initialQuery={q}
      />

      <div className="flex gap-2">
        {filters.map((f) => (
          <Link
            key={f.label}
            href={buildHref(f.key)}
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

      <p className="text-sm text-muted-foreground">{rows.length} ziyaret</p>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ziyaret bulunamadı.
          </p>
        ) : (
          rows.map((v) => {
            const company = Array.isArray(v.companies)
              ? v.companies[0]
              : v.companies;
            const sp = Array.isArray(v.salesperson)
              ? v.salesperson[0]
              : v.salesperson;
            return (
              <Card key={v.id}>
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <Link
                    href={`/ziyaret/${v.id}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{company?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {VISIT_TYPE_LABELS[v.visit_type]} · {v.visit_date} ·{" "}
                        {sp?.full_name ?? "—"}
                        {company?.city ? ` · ${company.city}` : ""}
                      </div>
                    </div>
                    <Badge
                      variant={v.status === "taslak" ? "warning" : "success"}
                    >
                      {VISIT_STATUS_LABELS[v.status]}
                    </Badge>
                  </Link>
                  {v.company_id && (
                    <Link
                      href={`/admin/bayi/${v.company_id}`}
                      className="shrink-0 text-sm text-primary hover:underline"
                      title="Bayi dosyası"
                    >
                      Bayi
                    </Link>
                  )}
                  {isAdmin && <AdminVisitDeleteButton visitId={v.id} />}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
