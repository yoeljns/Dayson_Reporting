import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { formatTRY } from "@/lib/utils";

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
      "id, product_name, observed_price, currency, observed_at, city, note, competitors(name), companies(name), salesperson:salesperson_id(full_name)"
    )
    .order("observed_at", { ascending: false })
    .limit(300);
  if (searchParams.competitor)
    query = query.eq("competitor_id", searchParams.competitor);

  const { data: obs } = await query;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Rakip Fiyat Haritası</h1>

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
                      <td className="p-2 whitespace-nowrap">{o.observed_at}</td>
                      <td className="p-2">{comp?.name}</td>
                      <td className="p-2">{o.product_name}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {formatTRY(o.observed_price)}
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
