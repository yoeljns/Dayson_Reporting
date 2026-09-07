import Link from "next/link";
import { FileText, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ReportsControls } from "@/components/reports-controls";
import { REPORTS, REPORT_ORDER, REPORT_GROUPS, type ReportType } from "@/lib/reports";
import { REPORT_RANGE_MODE } from "@/lib/reports/builders";
import { parseFilters, resolveRange } from "@/lib/reports/filters";

const PREVIEW_ROWS = 50;

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
      : null;

  // ---------- Card gallery ----------
  if (!r) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Raporlar</h1>
          <p className="text-sm text-muted-foreground">
            Bir rapor seçin; süzün, ekranda önizleyin ve Excel&apos;e aktarın. Her
            kartın altında raporun hangi soruya cevap verdiği yazar.
          </p>
        </div>
        {REPORT_GROUPS.map((g) => {
          const items = REPORT_ORDER.filter((t) => REPORTS[t].group === g);
          if (items.length === 0) return null;
          return (
            <section key={g} className="space-y-2">
              <h2 className="section-label">{g}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => {
                  const def = REPORTS[t];
                  return (
                    <Link key={t} href={`/admin/raporlar?r=${t}`}>
                      <Card className="h-full hover:bg-accent">
                        <CardContent className="space-y-1.5 p-4">
                          <div className="flex items-center gap-2 font-medium">
                            <FileText className="h-4 w-4 shrink-0 text-primary" />
                            {def.label}
                            {def.heavy && <Badge variant="secondary">Ağır</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">{def.question}</p>
                          {def.defaultRangeText && (
                            <p className="text-xs text-muted-foreground">{def.defaultRangeText}</p>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // ---------- Selected report ----------
  const def = REPORTS[r as ReportType];
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string") usp.set(k, v);
  const filters = parseFilters(usp);

  const mode = REPORT_RANGE_MODE[r] ?? "none";
  let initStart = filters.start ?? "";
  let initEnd = filters.end ?? "";
  if (mode !== "none") {
    const rr = resolveRange(filters, mode);
    initStart = rr.start;
    initEnd = rr.end;
  }

  const [{ data: salespeople }, { data: competitors }, { data: prodCats }, { data: surveys }, preview] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("competitors").select("id, name").order("name"),
      supabase.from("product_categories").select("id, label_tr").eq("is_active", true).order("sort_order"),
      supabase.from("surveys").select("id, name, status").order("updated_at", { ascending: false }).limit(100),
      def.build(supabase, filters, { limit: PREVIEW_ROWS }),
    ]);

  const siblings = REPORT_ORDER.filter((t) => REPORTS[t].group === def.group);

  return (
    <div className="space-y-4">
      <Link
        href="/admin/raporlar"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Tüm raporlar
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{def.label}</h1>
          <Badge variant="outline">{def.group}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{def.question}</p>
      </div>

      {siblings.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {siblings.map((t) => (
            <Link
              key={t}
              href={`/admin/raporlar?r=${t}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                t === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {REPORTS[t].label}
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <ReportsControls
            key={r + usp.toString()}
            reportType={r}
            filters={def.filters}
            defaultRangeText={def.defaultRangeText}
            heavy={def.heavy}
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
              survey: filters.survey ?? "",
              year: filters.year ?? "",
            }}
            salespeople={((salespeople ?? []) as { id: string; full_name: string }[]).map((s) => ({
              id: s.id,
              name: s.full_name,
            }))}
            competitors={(competitors ?? []) as { id: string; name: string }[]}
            categories={((prodCats ?? []) as { id: string; label_tr: string }[]).map((c) => ({
              id: c.id,
              name: c.label_tr,
            }))}
            surveys={((surveys ?? []) as { id: string; name: string; status: string }[]).map((s) => ({
              id: s.id,
              name: s.status === "aktif" ? s.name : `${s.name} (${s.status})`,
            }))}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          Önizleme · {preview.rows.length}
          {preview.capped || preview.rows.length >= PREVIEW_ROWS ? "+" : ""} satır
        </span>
        <span className="text-xs text-muted-foreground">
          {preview.rows.length >= PREVIEW_ROWS
            ? `İlk ${PREVIEW_ROWS} satır gösteriliyor; Excel'de tüm kayıtlar yer alır (çok büyük sonuçlar 10.000 satırla sınırlanır ve dosyada "Bilgi" sayfasıyla uyarılır).`
            : "Tüm satırlar gösteriliyor."}
        </span>
      </div>

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
                  <td colSpan={preview.headers.length} className="p-6 text-center text-muted-foreground">
                    Bu filtrelerle kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                preview.rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {preview.headers.map((h) => {
                      const v = row[h];
                      return (
                        <td
                          key={h}
                          className="min-w-[8rem] max-w-[28rem] whitespace-pre-wrap break-words p-2 align-top"
                        >
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
    </div>
  );
}
