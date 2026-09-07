import type { SupabaseClient } from "@supabase/supabase-js";
import type { VisitRecordData, VisitRecordProduct } from "@/components/visit-record";
import type { QuestionWithOptions, VisitAnswer } from "@/types/db";
import type { VisitType, VisitStatus, SupplyKind } from "@/lib/enums";

const one = <T,>(r: T | T[] | null | undefined): T | null =>
  Array.isArray(r) ? (r[0] ?? null) : (r ?? null);

export type LoadedVisit = VisitRecordData & {
  salespersonId: string;
  companyId: string;
};

/**
 * Completed visits in a date range as fully readable records (answers with
 * labels, product matrix, contact). Shared by the weekly pack and file pages.
 */
export async function loadVisitRecords(
  supabase: SupabaseClient,
  opts: { start: string; end: string; salespersonId?: string; limit?: number }
): Promise<LoadedVisit[]> {
  let q = supabase
    .from("visits")
    .select(
      "id, visit_date, visit_type, status, company_id, salesperson_id, companies(name), salesperson:salesperson_id(full_name), contact:contact_id(name, role)"
    )
    .eq("status", "tamamlandi")
    .is("deleted_at", null)
    .gte("visit_date", opts.start)
    .lte("visit_date", opts.end)
    .order("visit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 2000);
  if (opts.salespersonId) q = q.eq("salesperson_id", opts.salespersonId);
  const { data: visitRows } = await q;
  type Row = {
    id: string;
    visit_date: string;
    visit_type: VisitType;
    status: VisitStatus;
    company_id: string;
    salesperson_id: string;
    companies: { name: string } | { name: string }[] | null;
    salesperson: { full_name: string } | { full_name: string }[] | null;
    contact: { name: string; role: string | null } | { name: string; role: string | null }[] | null;
  };
  const visits = (visitRows ?? []) as Row[];
  if (visits.length === 0) return [];
  const ids = visits.map((v) => v.id);

  const [{ data: questions }, { data: answers }, { data: products }, { data: cats }, { data: brands }] =
    await Promise.all([
      supabase.from("questions").select("*, question_options(*)").order("sort_order"),
      supabase.from("visit_answers").select("*").in("visit_id", ids),
      supabase
        .from("visit_product_answers")
        .select("visit_id, category_id, brand_id, supply_kind")
        .in("visit_id", ids),
      supabase.from("product_categories").select("id, label_tr"),
      supabase.from("product_brands").select("id, name"),
    ]);
  const qs = (questions as QuestionWithOptions[] | null) ?? [];
  const answersBy = new Map<string, VisitAnswer[]>();
  for (const a of (answers as VisitAnswer[] | null) ?? [])
    (answersBy.get(a.visit_id) ?? answersBy.set(a.visit_id, []).get(a.visit_id)!).push(a);
  const catLabel = new Map((cats ?? []).map((c) => [c.id, c.label_tr]));
  const brandName = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const productsBy = new Map<string, VisitRecordProduct[]>();
  for (const p of (products ?? []) as { visit_id: string; category_id: string; brand_id: string | null; supply_kind: SupplyKind }[])
    (productsBy.get(p.visit_id) ?? productsBy.set(p.visit_id, []).get(p.visit_id)!).push({
      categoryLabel: catLabel.get(p.category_id) ?? "—",
      brandLabel: (p.brand_id && brandName.get(p.brand_id)) || "—",
      supplyKind: p.supply_kind,
    });

  return visits.map((v) => ({
    id: v.id,
    visitDate: v.visit_date,
    visitType: v.visit_type,
    status: v.status,
    salesperson: one(v.salesperson)?.full_name ?? null,
    salespersonId: v.salesperson_id,
    companyId: v.company_id,
    companyName: one(v.companies)?.name ?? null,
    contactName: one(v.contact)?.name ?? null,
    contactRole: one(v.contact)?.role ?? null,
    questions: qs,
    answers: answersBy.get(v.id) ?? [],
    products: productsBy.get(v.id) ?? [],
  }));
}
