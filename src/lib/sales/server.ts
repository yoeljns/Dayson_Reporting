import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesCategory } from "@/types/db";

/** Shipped totals of one company for one year, per sales category. */
export type CategoryTotals = { qty: number; eur: number; koli: number; byMonth: number[] };
export type CompanyShipments = {
  byCategory: Map<string, CategoryTotals>;
  /** All shipments incl. excluded / unmapped products. */
  eur: number;
  koli: number;
};

const emptyTotals = (): CategoryTotals => ({ qty: 0, eur: 0, koli: 0, byMonth: Array(12).fill(0) });
export const emptyShipments = (): CompanyShipments => ({ byCategory: new Map(), eur: 0, koli: 0 });

export async function loadSalesCategories(
  supabase: SupabaseClient,
  opts: { includeInactive?: boolean } = {}
): Promise<SalesCategory[]> {
  let q = supabase.from("sales_categories").select("*").order("sort_order").order("created_at");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data as SalesCategory[] | null) ?? [];
}

type TotalsRow = {
  company_id: string | null;
  sales_category_id: string | null;
  year: number;
  month: number;
  qty: number | null;
  eur: number | null;
  koli: number | null;
};

function fold(rows: TotalsRow[]): Map<string, CompanyShipments> {
  const out = new Map<string, CompanyShipments>();
  for (const r of rows) {
    if (!r.company_id) continue;
    const c = out.get(r.company_id) ?? emptyShipments();
    out.set(r.company_id, c);
    c.eur += Number(r.eur ?? 0);
    c.koli += Number(r.koli ?? 0);
    if (!r.sales_category_id || r.qty == null) continue;
    const t = c.byCategory.get(r.sales_category_id) ?? emptyTotals();
    c.byCategory.set(r.sales_category_id, t);
    const q = Number(r.qty);
    t.qty += q;
    t.eur += Number(r.eur ?? 0);
    t.koli += Number(r.koli ?? 0);
    const m = Number(r.month) - 1;
    if (m >= 0 && m < 12) t.byMonth[m] += q;
  }
  return out;
}

/** One company's shipped totals for a year (empty when nothing shipped). */
export async function shipmentTotalsFor(
  supabase: SupabaseClient,
  companyId: string,
  year: number
): Promise<CompanyShipments> {
  const { data } = await supabase
    .from("shipment_month_totals")
    .select("*")
    .eq("company_id", companyId)
    .eq("year", year);
  return fold((data as TotalsRow[] | null) ?? []).get(companyId) ?? emptyShipments();
}

/** All companies' shipped totals for a year keyed by company id. */
export async function shipmentTotalsForYear(
  supabase: SupabaseClient,
  year: number
): Promise<Map<string, CompanyShipments>> {
  const { data } = await supabase
    .from("shipment_month_totals")
    .select("*")
    .eq("year", year)
    .not("company_id", "is", null)
    .limit(50000);
  return fold((data as TotalsRow[] | null) ?? []);
}
