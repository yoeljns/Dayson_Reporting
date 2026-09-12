import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesUnit } from "@/types/db";
import { buildTargetStatus } from "@/lib/rules/target";
import { loadSalesCategories, shipmentTotalsFor } from "@/lib/sales/server";
import { getTargetFor } from "@/lib/targets/server";
import { getPaceThresholds } from "@/lib/settings";

/**
 * Pre-visit brief ("Hazırlık"): what the rep should know before walking in —
 * last shipment, last three months, last visit + promised next step, open
 * complaints, target gaps, last stock count, last competitor sighting.
 * No € anywhere (salesperson screens).
 */
export type QtyLine = { label: string; qty: number; unit: SalesUnit };

export type CompanyBrief = {
  lastShipment: { date: string; lines: QtyLine[] } | null;
  /** Current month + previous two, per sales category. */
  recent: QtyLine[];
  lastVisit: {
    id: string;
    date: string;
    rep: string | null;
    nextAction: string | null;
    nextDate: string | null;
    note: string | null;
  } | null;
  openComplaints: { count: number; titles: string[] };
  target: {
    withTarget: number;
    behindLines: { label: string; shipped: number; target: number; unit: SalesUnit }[];
    mastikMonth: { label: string; target: number; shipped: number; remaining: number } | null;
  } | null;
  lastStock: { id: string; date: string; total: number } | null;
  lastCompetitor: {
    id: string;
    competitor: string;
    product: string;
    price: number | null;
    vat: boolean | null;
    date: string;
  } | null;
};

const OPEN_STATUSES = ["acik", "islemde"];
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export async function companyBrief(
  supabase: SupabaseClient,
  companyId: string,
  opts: { isDealer: boolean; today: string }
): Promise<CompanyBrief> {
  const year = Number(opts.today.slice(0, 4));
  const month = Number(opts.today.slice(5, 7));
  const [
    categories,
    { data: lastShipRows },
    { data: monthRows },
    { data: lastVisitRows },
    complaintsRes,
    target,
    shipments,
    thresholds,
    { data: stockRows },
    { data: compRows },
  ] = await Promise.all([
    loadSalesCategories(supabase),
    supabase
      .from("shipments")
      .select("fis_date, sales_category_id, qty")
      .eq("company_id", companyId)
      .order("fis_date", { ascending: false })
      .limit(60),
    supabase
      .from("shipment_month_totals")
      .select("sales_category_id, year, month, qty")
      .eq("company_id", companyId)
      .gte("year", year - 1),
    supabase
      .from("visits")
      .select("id, visit_date, salesperson:salesperson_id(full_name)")
      .eq("company_id", companyId)
      .eq("status", "tamamlandi")
      .is("deleted_at", null)
      .order("visit_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
    opts.isDealer
      ? supabase
          .from("complaints")
          .select("id, title", { count: "exact" })
          .eq("company_id", companyId)
          .eq("is_draft", false)
          .in("status", OPEN_STATUSES)
          .order("created_at", { ascending: false })
          .limit(2)
      : Promise.resolve({ data: [] as { id: string; title: string }[], count: 0 }),
    opts.isDealer ? getTargetFor(supabase, companyId, year) : Promise.resolve(null),
    opts.isDealer ? shipmentTotalsFor(supabase, companyId, year) : Promise.resolve(null),
    getPaceThresholds(),
    opts.isDealer
      ? supabase
          .from("stock_counts")
          .select("id, counted_at, stock_count_lines(pallets)")
          .eq("company_id", companyId)
          .order("counted_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("competitor_observations")
      .select("id, product_name, observed_price, price_includes_vat, observed_at, competitors(name)")
      .eq("company_id", companyId)
      .eq("is_draft", false)
      .order("observed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const sumBy = (rows: { sales_category_id: string | null; qty: number | null }[]): QtyLine[] => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.sales_category_id && r.qty) m.set(r.sales_category_id, (m.get(r.sales_category_id) ?? 0) + Number(r.qty));
    return categories
      .filter((c) => (m.get(c.id) ?? 0) > 0)
      .map((c) => ({ label: c.label_tr, qty: m.get(c.id)!, unit: c.unit }));
  };

  // Last shipment day (all lines of that day).
  const ship = (lastShipRows as { fis_date: string; sales_category_id: string | null; qty: number | null }[] | null) ?? [];
  const lastDate = ship[0]?.fis_date ?? null;
  const lastShipment = lastDate ? { date: lastDate, lines: sumBy(ship.filter((r) => r.fis_date === lastDate)) } : null;

  // Current month + two previous.
  const recentKeys = new Set<string>();
  for (let i = 0; i < 3; i++) {
    let y = year;
    let m = month - i;
    if (m <= 0) {
      m += 12;
      y -= 1;
    }
    recentKeys.add(`${y}-${m}`);
  }
  const recent = sumBy(
    ((monthRows as { sales_category_id: string | null; year: number; month: number; qty: number | null }[] | null) ?? []).filter(
      (r) => recentKeys.has(`${r.year}-${r.month}`)
    )
  );

  // Last completed visit + its promised next step / note.
  let lastVisit: CompanyBrief["lastVisit"] = null;
  const lv = (lastVisitRows as unknown as { id: string; visit_date: string; salesperson: { full_name: string } | { full_name: string }[] | null }[] | null)?.[0];
  if (lv) {
    const { data: qs } = await supabase
      .from("questions")
      .select("id, code, question_options(value, label_tr)")
      .in("code", ["sonraki_aksiyon", "sonraki_ziyaret_tarihi", "serbest_not"]);
    const qRows = (qs as { id: string; code: string; question_options: { value: string; label_tr: string }[] | null }[] | null) ?? [];
    const { data: ans } = qRows.length
      ? await supabase
          .from("visit_answers")
          .select("question_id, value_text, value_date, value_detail")
          .eq("visit_id", lv.id)
          .in("question_id", qRows.map((q) => q.id))
      : { data: [] as { question_id: string; value_text: string | null; value_date: string | null; value_detail: string | null }[] };
    const byCode = new Map(qRows.map((q) => [q.code, q]));
    const answerOf = (code: string) => {
      const q = byCode.get(code);
      return q ? (ans ?? []).find((a) => a.question_id === q.id) ?? null : null;
    };
    const na = answerOf("sonraki_aksiyon");
    const naQ = byCode.get("sonraki_aksiyon");
    const naLabel = na?.value_text
      ? (naQ?.question_options ?? []).find((o) => o.value === na.value_text)?.label_tr ?? na.value_text
      : null;
    lastVisit = {
      id: lv.id,
      date: lv.visit_date,
      rep: one(lv.salesperson)?.full_name ?? null,
      nextAction: naLabel ? `${naLabel}${na?.value_detail ? ` (${na.value_detail})` : ""}` : null,
      nextDate: answerOf("sonraki_ziyaret_tarihi")?.value_date ?? null,
      note: answerOf("serbest_not")?.value_text ?? null,
    };
  }

  const complaints = (complaintsRes.data as { id: string; title: string }[] | null) ?? [];
  const openComplaints = { count: complaintsRes.count ?? complaints.length, titles: complaints.map((c) => c.title).filter(Boolean) };

  let targetBrief: CompanyBrief["target"] = null;
  if (opts.isDealer && (target || shipments)) {
    const st = buildTargetStatus(target?.lines ?? [], categories, shipments, year, opts.today, thresholds);
    if (st.withTarget > 0) {
      const mastik = st.lines.find((l) => l.category.code === "mastik" && l.month && l.target > 0) ?? null;
      targetBrief = {
        withTarget: st.withTarget,
        behindLines: st.lines
          .filter((l) => l.pace.pace === "geride")
          .map((l) => ({ label: l.category.label_tr, shipped: l.shipped, target: l.target, unit: l.category.unit })),
        mastikMonth: mastik?.month
          ? { label: mastik.category.label_tr, target: mastik.month.target, shipped: mastik.month.shipped, remaining: mastik.month.remaining }
          : null,
      };
    }
  }

  const sc = (stockRows as { id: string; counted_at: string; stock_count_lines: { pallets: number }[] | null }[] | null)?.[0];
  const lastStock = sc
    ? { id: sc.id, date: sc.counted_at, total: (sc.stock_count_lines ?? []).reduce((a, l) => a + Number(l.pallets), 0) }
    : null;

  const co = (compRows as unknown as {
    id: string;
    product_name: string;
    observed_price: number | null;
    price_includes_vat: boolean | null;
    observed_at: string;
    competitors: { name: string } | { name: string }[] | null;
  }[] | null)?.[0];
  const lastCompetitor = co
    ? {
        id: co.id,
        competitor: one(co.competitors)?.name ?? "Rakip",
        product: co.product_name,
        price: co.observed_price != null ? Number(co.observed_price) : null,
        vat: co.price_includes_vat,
        date: co.observed_at,
      }
    : null;

  return { lastShipment, recent, lastVisit, openComplaints, target: targetBrief, lastStock, lastCompetitor };
}

/** One-line hints for a list of companies (today's plan): last shipment / visit / open complaints. */
export type PlanHint = { lastShipment: string | null; lastVisit: string | null; openComplaints: number };

export async function planHints(supabase: SupabaseClient, companyIds: string[]): Promise<Map<string, PlanHint>> {
  const out = new Map<string, PlanHint>();
  if (companyIds.length === 0) return out;
  for (const id of companyIds) out.set(id, { lastShipment: null, lastVisit: null, openComplaints: 0 });
  const [{ data: ships }, { data: lv }, { data: comps }] = await Promise.all([
    supabase
      .from("shipments")
      .select("company_id, fis_date")
      .in("company_id", companyIds)
      .order("fis_date", { ascending: false })
      .limit(2000),
    supabase.from("company_last_visit").select("company_id, last_visit_date").in("company_id", companyIds),
    supabase
      .from("complaints")
      .select("company_id")
      .in("company_id", companyIds)
      .eq("is_draft", false)
      .in("status", OPEN_STATUSES)
      .limit(1000),
  ]);
  for (const s of (ships as { company_id: string; fis_date: string }[] | null) ?? []) {
    const h = out.get(s.company_id);
    if (h && !h.lastShipment) h.lastShipment = s.fis_date;
  }
  for (const v of (lv as { company_id: string; last_visit_date: string | null }[] | null) ?? []) {
    const h = out.get(v.company_id);
    if (h) h.lastVisit = v.last_visit_date;
  }
  for (const c of (comps as { company_id: string | null }[] | null) ?? []) {
    const h = c.company_id ? out.get(c.company_id) : null;
    if (h) h.openComplaints += 1;
  }
  return out;
}
