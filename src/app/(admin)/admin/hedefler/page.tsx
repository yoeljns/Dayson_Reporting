import Link from "next/link";
import { Download, Upload } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaceBadge } from "@/components/target-view";
import { pendingProposalsForYear, targetsForYear } from "@/lib/targets/server";
import { loadSalesCategories, shipmentTotalsForYear } from "@/lib/sales/server";
import { buildTargetStatus, elapsedFractionOfYear, fmtEur, fmtQtyUnit, fmtUnit } from "@/lib/rules/target";
import { getPaceThresholds } from "@/lib/settings";
import { todayIso } from "@/lib/week";
import { TARGET_STATUS_LABELS } from "@/lib/enums";
import { cn } from "@/lib/utils";

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: { year?: string; q?: string };
}) {
  await requireManager();
  const supabase = createClient();
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const year = Number(searchParams.year) || thisYear;
  const q = (searchParams.q ?? "").trim().toLocaleLowerCase("tr");

  const [{ data: dealers }, targets, shipments, categories, thresholds, proposals] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, city, logo_code")
      .eq("kind", "distributor")
      .is("deleted_at", null)
      .order("name")
      .limit(3000),
    targetsForYear(supabase, year),
    shipmentTotalsForYear(supabase, year),
    loadSalesCategories(supabase),
    getPaceThresholds(),
    pendingProposalsForYear(supabase, year),
  ]);
  const elapsed = elapsedFractionOfYear(year, today);
  const pendingByCompany = new Map(proposals.map((p) => [p.company_id, p]));
  const mastik = categories.find((c) => c.code === "mastik") ?? null;

  const rows = ((dealers as { id: string; name: string; city: string | null; logo_code: string | null }[] | null) ?? [])
    .filter((d) => !q || d.name.toLocaleLowerCase("tr").includes(q))
    .map((d) => {
      const t = targets.get(d.id) ?? null;
      const st = buildTargetStatus(t?.lines ?? [], categories, shipments.get(d.id) ?? null, year, today, thresholds);
      const m = mastik ? st.lines.find((l) => l.category.id === mastik.id) ?? null : null;
      return { ...d, t, st, m, proposal: pendingByCompany.get(d.id) ?? null };
    })
    // Pending proposals first, then behind, on-track, ahead, no target.
    .sort((a, b) => {
      const order = (p: typeof a) =>
        p.proposal ? -1 : !p.st.withTarget ? 3 : p.st.pace === "geride" ? 0 : p.st.pace === "yolunda" ? 1 : 2;
      return order(a) - order(b) || b.st.behind - a.st.behind || a.name.localeCompare(b.name, "tr");
    });
  const withTarget = rows.filter((r) => r.st.withTarget > 0).length;
  const behind = rows.filter((r) => r.st.pace === "geride").length;
  const years = [thisYear - 1, thisYear, thisYear + 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Hedefler</h1>
          <p className="text-sm text-muted-foreground">
            {year} yılı bayi hedefleri: {withTarget} bayide hedef var, {behind} bayi geride. Yılın %
            {Math.round(elapsed * 100)}&apos;i geçti. Sevk edilen miktarlar haftalık sevkiyat dosyasından gelir.
            {proposals.length > 0 ? ` ${proposals.length} pazarlamacı önerisi onay bekliyor.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/sevkiyat">
            <Button variant="outline" size="sm">
              <Upload className="mr-1 h-4 w-4" /> Sevkiyat yükle
            </Button>
          </Link>
          <Link href={`/api/admin/raporlar?type=hedef&year=${year}`}>
            <Button variant="outline" size="sm">
              <Download className="mr-1 h-4 w-4" /> Excel
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/admin/hedefler?year=${y}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              y === year ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {y}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="year" value={year} />
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Bayi ara…"
            className="h-8 w-48 rounded-md border bg-background px-3 text-sm"
          />
          <Button type="submit" variant="secondary" size="sm">
            Ara
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Bayi</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">Geride</th>
                <th className="px-3 py-2">{mastik?.label_tr ?? "PU Mastik"}</th>
                <th className="px-3 py-2 text-right">Sevk €</th>
                <th className="px-3 py-2">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <Link href={`/admin/hedefler/${r.id}/${year}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {[r.logo_code, r.city].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.proposal && (
                      <Link href={`/admin/hedefler/${r.id}/${year}`} className="mr-1 inline-block">
                        <Badge variant="warning">Öneri bekliyor</Badge>
                      </Link>
                    )}
                    {r.t ? (
                      <Badge
                        variant={r.t.status === "mutabik" ? "success" : r.t.status === "iptal" ? "secondary" : "warning"}
                      >
                        {TARGET_STATUS_LABELS[r.t.status]}
                      </Badge>
                    ) : (
                      <Link href={`/admin/hedefler/${r.id}/${year}`} className="text-xs text-muted-foreground underline">
                        Hedef gir
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.st.withTarget > 0 ? `${r.st.behind}/${r.st.withTarget}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.m && (r.m.target > 0 || r.m.shipped > 0) ? (
                      <span className="tabular-nums">
                        {fmtQtyUnit(r.m.shipped, "palet")}
                        {r.m.target > 0 ? ` / ${fmtQtyUnit(r.m.target, "palet")}` : ""} palet
                        {r.m.month && r.m.target > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            bu ay kalan {fmtUnit(r.m.month.remaining, "palet")}
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.st.eur > 0 ? fmtEur(r.st.eur) : "—"}</td>
                  <td className="px-3 py-2">
                    <PaceBadge pace={r.st.pace} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
