import Link from "next/link";
import { Download } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTRDate, daysSince } from "@/lib/week";
import { countedSkus, latestCounts, fmtPallet } from "@/lib/stock/server";
import { getStaleDays } from "@/lib/settings";

export default async function StockOverviewPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireManager();
  const supabase = createClient();
  const q = (searchParams.q ?? "").trim().toLocaleLowerCase("tr");

  const [skus, { data: dealers }, latest, staleDays] = await Promise.all([
    countedSkus(supabase),
    supabase
      .from("companies")
      .select("id, name, city, logo_code")
      .eq("kind", "distributor")
      .is("deleted_at", null)
      .order("name")
      .limit(3000),
    latestCounts(supabase),
    getStaleDays(),
  ]);

  const rows = ((dealers as { id: string; name: string; city: string | null; logo_code: string | null }[] | null) ?? [])
    .filter((d) => !q || d.name.toLocaleLowerCase("tr").includes(q) || (d.city ?? "").toLocaleLowerCase("tr").includes(q))
    .map((d) => ({ ...d, last: latest.get(d.id) ?? null }))
    // Counted dealers first (freshest on top), then never-counted.
    .sort((a, b) => {
      if (a.last && b.last) return a.last.countedAt < b.last.countedAt ? 1 : -1;
      if (a.last) return -1;
      if (b.last) return 1;
      return a.name.localeCompare(b.name, "tr");
    });
  const countedN = rows.filter((r) => r.last).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Stok Durumu</h1>
          <p className="text-sm text-muted-foreground">
            Her bayinin son palet sayımı. {countedN} / {rows.length} bayide sayım var.
            Sayılacak ürünleri <Link href="/admin/urunler" className="underline">Ürünler</Link>{" "}
            ekranından seçersiniz.
          </p>
        </div>
        <Link href="/api/admin/raporlar?type=stok">
          <Button variant="outline" size="sm">
            <Download className="mr-1 h-4 w-4" /> Excel
          </Button>
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Bayi / il ara…"
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
        />
        <Button type="submit" variant="secondary" size="sm">
          Ara
        </Button>
      </form>

      {skus.length === 0 && (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">
          Stok sayımında görünen ürün yok. Önce Ürünler ekranından ürün ekleyin.
        </p>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Bayi</th>
                <th className="px-3 py-2">Son sayım</th>
                {skus.map((s) => (
                  <th key={s.id} className="px-2 py-2 text-right" title={s.name_tr}>
                    {s.code}
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Toplam</th>
                <th className="px-3 py-2">Pazarlamacı</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = r.last ? daysSince(r.last.countedAt) : null;
                const stale = d != null && d > staleDays;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="px-3 py-2">
                      <Link href={`/admin/bayi/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {[r.logo_code, r.city].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.last ? (
                        <>
                          {formatTRDate(r.last.countedAt)}
                          <span className="block text-xs">
                            {stale ? (
                              <Badge variant="warning">{d} gün önce</Badge>
                            ) : (
                              <span className="text-muted-foreground">{d} gün önce</span>
                            )}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Sayım yok</span>
                      )}
                    </td>
                    {skus.map((s) => (
                      <td key={s.id} className="px-2 py-2 text-right tabular-nums">
                        {r.last ? fmtPallet(r.last.lines[s.id] ?? 0) : "—"}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">
                      {r.last ? fmtPallet(r.last.total) : "—"}
                    </td>
                    <td className="px-3 py-2">{r.last?.salesperson ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
