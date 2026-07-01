import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReportsControls } from "@/components/reports-controls";
import { REPORTS, REPORT_ORDER, type ReportType } from "@/lib/reports";
import { REPORT_RANGE_MODE } from "@/lib/reports/builders";
import { parseFilters, resolveRange } from "@/lib/reports/filters";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireManager();
  const supabase = createClient();

  const r =
    typeof searchParams.r === "string" && REPORT_ORDER.includes(searchParams.r)
      ? searchParams.r
      : "ziyaret";
  const def = REPORTS[r as ReportType];

  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") usp.set(k, v);
  }
  const filters = parseFilters(usp);

  // Effective dates for the controls' initial display (builders default the same way).
  const mode = REPORT_RANGE_MODE[r] ?? "none";
  let initStart = "";
  let initEnd = "";
  if (mode !== "none") {
    const rr = resolveRange(filters, mode);
    initStart = rr.start;
    initEnd = rr.end;
  }

  const [{ data: salespeople }, { data: competitors }, { data: prodCats }, preview] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name"),
      supabase.from("competitors").select("id, name").order("name"),
      supabase
        .from("product_categories")
        .select("id, label_tr")
        .eq("is_active", true)
        .order("sort_order"),
      def.build(supabase, filters, { limit: 50 }),
    ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Raporlar</h1>
        <p className="text-sm text-muted-foreground">
          {"Rapor seç, filtrele, ekranda önizle ve Excel'e aktar."}
        </p>
      </div>

      {/* Report selector */}
      <div className="flex flex-wrap gap-2">
        {REPORT_ORDER.map((t) => (
          <Link
            key={t}
            href={`/admin/raporlar?r=${t}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              t === r
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {REPORTS[t].label}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <ReportsControls
            key={r}
            reportType={r}
            filters={def.filters}
            initial={{
              start: initStart,
              end: initEnd,
              sp: filters.sp ?? "",
              status: filters.status ?? "",
              dept: filters.dept ?? "",
              competitor: filters.competitor ?? "",
              segment: filters.segment ?? "",
              kind: filters.kind ?? "",
              category: filters.category ?? "",
            }}
            salespeople={
              ((salespeople ?? []) as { id: string; full_name: string }[]).map(
                (s) => ({ id: s.id, name: s.full_name })
              )
            }
            competitors={(competitors ?? []) as { id: string; name: string }[]}
            categories={
              ((prodCats ?? []) as { id: string; label_tr: string }[]).map((c) => ({
                id: c.id,
                name: c.label_tr,
              }))
            }
          />
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                {preview.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap p-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={preview.headers.length}
                    className="p-6 text-center text-muted-foreground"
                  >
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                preview.rows.map((row, i) => (
                  <tr key={i} className="border-b">
                    {preview.headers.map((h) => {
                      const v = row[h];
                      return (
                        <td key={h} className="whitespace-nowrap p-2">
                          {v == null || v === "" ? "—" : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        {"Önizlemede ilk 50 satır gösterilir; Excel'e aktarımda tüm kayıtlar yer alır."}
      </p>
    </div>
  );
}
