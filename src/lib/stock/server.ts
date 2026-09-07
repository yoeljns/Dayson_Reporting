import type { SupabaseClient } from "@supabase/supabase-js";

export type StockSkuCol = { id: string; code: string; name_tr: string };
export type LatestCount = {
  id: string;
  companyId: string;
  countedAt: string;
  salespersonId: string;
  salesperson: string | null;
  note: string | null;
  lines: Record<string, number>; // sku_id → pallets
  total: number;
};

/** SKUs shown in stock counts (active + in_stock_count), in display order. */
export async function countedSkus(supabase: SupabaseClient): Promise<StockSkuCol[]> {
  const { data } = await supabase
    .from("skus")
    .select("id, code, name_tr")
    .eq("is_active", true)
    .eq("in_stock_count", true)
    .order("sort_order")
    .order("created_at");
  return (data as StockSkuCol[] | null) ?? [];
}

/**
 * Latest stock count per company (optionally only for the given ids), with
 * its lines. Pulls the newest N heads and keeps the first per company.
 */
export async function latestCounts(
  supabase: SupabaseClient,
  opts: { companyIds?: string[]; limit?: number } = {}
): Promise<Map<string, LatestCount>> {
  let q = supabase
    .from("stock_counts")
    .select("id, company_id, counted_at, salesperson_id, note, salesperson:salesperson_id(full_name)")
    .order("counted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 2000);
  if (opts.companyIds && opts.companyIds.length > 0) q = q.in("company_id", opts.companyIds);
  const { data } = await q;
  const heads = (data as unknown as {
    id: string;
    company_id: string;
    counted_at: string;
    salesperson_id: string;
    note: string | null;
    salesperson: { full_name: string } | { full_name: string }[] | null;
  }[] | null) ?? [];
  const byCompany = new Map<string, LatestCount>();
  for (const h of heads) {
    if (byCompany.has(h.company_id)) continue;
    const sp = Array.isArray(h.salesperson) ? h.salesperson[0] : h.salesperson;
    byCompany.set(h.company_id, {
      id: h.id,
      companyId: h.company_id,
      countedAt: h.counted_at,
      salespersonId: h.salesperson_id,
      salesperson: sp?.full_name ?? null,
      note: h.note,
      lines: {},
      total: 0,
    });
  }
  const ids = Array.from(byCompany.values()).map((c) => c.id);
  if (ids.length > 0) {
    const byId = new Map(Array.from(byCompany.values()).map((c) => [c.id, c]));
    // Chunk to keep the IN list reasonable.
    for (let i = 0; i < ids.length; i += 200) {
      const { data: lines } = await supabase
        .from("stock_count_lines")
        .select("stock_count_id, sku_id, pallets")
        .in("stock_count_id", ids.slice(i, i + 200));
      for (const l of lines ?? []) {
        const c = byId.get(l.stock_count_id);
        if (!c) continue;
        const n = Number(l.pallets);
        c.lines[l.sku_id] = n;
        c.total += n;
      }
    }
  }
  return byCompany;
}

/** All counts of one company (newest first) with lines — the Stok tab. */
export async function companyCountHistory(
  supabase: SupabaseClient,
  companyId: string,
  limit = 12
): Promise<LatestCount[]> {
  const { data } = await supabase
    .from("stock_counts")
    .select("id, company_id, counted_at, salesperson_id, note, salesperson:salesperson_id(full_name)")
    .eq("company_id", companyId)
    .order("counted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  const heads = (data as unknown as {
    id: string;
    company_id: string;
    counted_at: string;
    salesperson_id: string;
    note: string | null;
    salesperson: { full_name: string } | { full_name: string }[] | null;
  }[] | null) ?? [];
  const list: LatestCount[] = heads.map((h) => {
    const sp = Array.isArray(h.salesperson) ? h.salesperson[0] : h.salesperson;
    return {
      id: h.id,
      companyId: h.company_id,
      countedAt: h.counted_at,
      salespersonId: h.salesperson_id,
      salesperson: sp?.full_name ?? null,
      note: h.note,
      lines: {},
      total: 0,
    };
  });
  if (list.length > 0) {
    const byId = new Map(list.map((c) => [c.id, c]));
    const { data: lines } = await supabase
      .from("stock_count_lines")
      .select("stock_count_id, sku_id, pallets")
      .in("stock_count_id", list.map((c) => c.id));
    for (const l of lines ?? []) {
      const c = byId.get(l.stock_count_id);
      if (!c) continue;
      const n = Number(l.pallets);
      c.lines[l.sku_id] = n;
      c.total += n;
    }
  }
  return list;
}

export const fmtPallet = (n: number | undefined) =>
  n === undefined ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
