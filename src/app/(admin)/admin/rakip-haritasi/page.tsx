import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatTRY } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ObservationMapButton } from "@/components/observation-map-button";
import { getPhotosForMany } from "@/lib/photos/server";
import { PhotoGrid } from "@/components/photo-grid";

export default async function CompetitorMapPage({
  searchParams,
}: {
  searchParams: { competitor?: string };
}) {
  await requireManager();
  const supabase = createClient();

  const { data: competitors } = await supabase
    .from("competitors")
    .select("id, name")
    .order("name");

  let query = supabase
    .from("competitor_observations")
    .select(
      "id, product_name, observed_price, price_includes_vat, currency, observed_at, city, note, competitor_id, competitor_product_id, competitors(name), companies(name), salesperson:salesperson_id(full_name)"
    )
    .eq("is_draft", false)
    .order("observed_at", { ascending: false })
    .limit(300);
  if (searchParams.competitor)
    query = query.eq("competitor_id", searchParams.competitor);

  const { data: obs } = await query;
  const [{ data: products }, photos] = await Promise.all([
    supabase
      .from("competitor_products")
      .select("id, competitor_id, name")
      .eq("is_active", true)
      .order("name"),
    getPhotosForMany("competitor_observation", (obs ?? []).map((o) => o.id)),
  ]);
  const productsByComp = new Map<string, { id: string; name: string }[]>();
  for (const p of (products ?? []) as { id: string; competitor_id: string; name: string }[]) {
    (productsByComp.get(p.competitor_id) ?? productsByComp.set(p.competitor_id, []).get(p.competitor_id)!).push({ id: p.id, name: p.name });
  }
  const freeCount = (obs ?? []).filter((o) => !o.competitor_product_id).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Rakip Bilgileri</h1>
        <p className="text-sm text-muted-foreground">
          Sahadan gelen rakip ürün / fiyat gözlemleri. &quot;Serbest&quot; yazılan
          ürünleri kataloğa eşleyin ki raporlarda aynı ürün tek satırda toplansın
          {freeCount > 0 ? ` (${freeCount} serbest kayıt)` : ""}.
        </p>
      </div>

      <form className="flex items-center gap-2">
        <select
          name="competitor"
          defaultValue={searchParams.competitor ?? ""}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Tüm rakipler</option>
          {(competitors ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md border px-3 text-sm hover:bg-accent"
        >
          Filtrele
        </button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="p-2">Tarih</th>
                <th className="p-2">Rakip</th>
                <th className="p-2">Ürün</th>
                <th className="p-2 text-right">Fiyat</th>
                <th className="p-2">Şehir</th>
                <th className="p-2">Firma</th>
                <th className="p-2">Pazarlamacı</th>
              </tr>
            </thead>
            <tbody>
              {!obs || obs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-6 text-center text-muted-foreground"
                  >
                    Kayıt yok.
                  </td>
                </tr>
              ) : (
                obs.map((o) => {
                  const comp = Array.isArray(o.competitors)
                    ? o.competitors[0]
                    : (o.competitors as { name: string } | null);
                  const company = Array.isArray(o.companies)
                    ? o.companies[0]
                    : (o.companies as { name: string } | null);
                  const sp = Array.isArray(o.salesperson)
                    ? o.salesperson[0]
                    : (o.salesperson as { full_name: string } | null);
                  return (
                    <tr key={o.id} className="border-b">
                      <td className="p-2 whitespace-nowrap">
                        <Link href={`/rakip/${o.id}`} className="hover:underline">
                          {o.observed_at}
                        </Link>
                      </td>
                      <td className="p-2">{comp?.name}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{o.product_name}</span>
                          {!o.competitor_product_id && (
                            <>
                              <Badge variant="secondary">Serbest</Badge>
                              {o.competitor_id && (
                                <ObservationMapButton
                                  observationId={o.id}
                                  productName={o.product_name}
                                  products={productsByComp.get(o.competitor_id) ?? []}
                                />
                              )}
                            </>
                          )}
                        </div>
                        {o.note && (
                          <div className="text-xs text-muted-foreground">{o.note}</div>
                        )}
                        {(photos[o.id]?.length ?? 0) > 0 && (
                          <div className="mt-1">
                            <PhotoGrid photos={photos[o.id]} size="sm" />
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {formatTRY(o.observed_price)}
                        {o.observed_price != null && (
                          <span className="block text-[11px] text-muted-foreground">
                            {o.price_includes_vat === true ? "KDV dahil" : o.price_includes_vat === false ? "KDV hariç" : "KDV ?"}
                          </span>
                        )}
                      </td>
                      <td className="p-2">{o.city ?? "—"}</td>
                      <td className="p-2">{company?.name ?? "—"}</td>
                      <td className="p-2">{sp?.full_name ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
