import { formatTRDate, daysSince } from "@/lib/week";
import { fmtPallet, type LatestCount, type StockSkuCol } from "@/lib/stock/server";
import { stockCountCode } from "@/lib/codes";

/** Compact table of a company's stock counts (server component). */
export function StockHistory({
  counts,
  skus,
  emptyText = "Henüz stok sayımı yok.",
}: {
  counts: LatestCount[];
  skus: StockSkuCol[];
  emptyText?: string;
}) {
  if (counts.length === 0)
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  // Only columns that appear in at least one count (plus current SKUs).
  const usedSkuIds = new Set<string>();
  for (const c of counts) for (const k of Object.keys(c.lines)) usedSkuIds.add(k);
  const cols = skus.filter((s) => usedSkuIds.has(s.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-3">Tarih</th>
            {cols.map((s) => (
              <th key={s.id} className="px-2 py-1.5 text-right" title={s.name_tr}>
                {s.code}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right">Toplam</th>
            <th className="py-1.5 pl-3">Pazarlamacı</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((c) => {
            const d = daysSince(c.countedAt);
            return (
              <tr key={c.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap py-1.5 pr-3">
                  {formatTRDate(c.countedAt)}
                  <span className="block text-[11px] text-muted-foreground">
                    {stockCountCode(c.id)}
                    {d != null ? ` · ${d} gün önce` : ""}
                  </span>
                </td>
                {cols.map((s) => (
                  <td key={s.id} className="px-2 py-1.5 text-right tabular-nums">
                    {fmtPallet(c.lines[s.id])}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                  {fmtPallet(c.total)}
                </td>
                <td className="py-1.5 pl-3">
                  {c.salesperson ?? "—"}
                  {c.note && (
                    <span className="block text-xs text-muted-foreground">{c.note}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
