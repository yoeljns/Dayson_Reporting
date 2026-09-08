import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTRDate, daysSince, todayIso } from "@/lib/week";
import { ROW_CAP, resolveRange, type ReportFilters } from "@/lib/reports/filters";
import type { SheetRow } from "@/lib/reports/sheet";
import type { BuildResult, BuildOpts } from "@/lib/reports/builders";
import { countedSkus, latestCounts } from "@/lib/stock/server";
import { targetsForYear } from "@/lib/targets/server";
import { buildTargetStatus, MONTHS_TR_SHORT } from "@/lib/rules/target";
import { loadSalesCategories, shipmentTotalsForYear } from "@/lib/sales/server";
import { getPaceThresholds } from "@/lib/settings";
import { formatSurveyAnswer } from "@/lib/rules/survey";
import { PACE_LABELS, TARGET_STATUS_LABELS, COMPANY_KIND_LABELS, type CompanyKind } from "@/lib/enums";
import type { SurveyQuestion } from "@/types/db";

type Builder = (supabase: SupabaseClient, f: ReportFilters, opts?: BuildOpts) => Promise<BuildResult>;

const one = <T,>(r: T | T[] | null | undefined): T | null =>
  Array.isArray(r) ? (r[0] ?? null) : (r ?? null);

// ---------------------------------------------------------------------------
// Stok Durumu — dealer × SKU latest pallet count
// ---------------------------------------------------------------------------
export const buildStok: Builder = async (supabase, f, opts) => {
  const max = opts?.limit ?? ROW_CAP;
  const [skus, { data: dealers }, latest, { data: assignments }, { data: profiles }] =
    await Promise.all([
      countedSkus(supabase),
      supabase
        .from("companies")
        .select("id, name, city, logo_code, segment")
        .eq("kind", "distributor")
        .is("deleted_at", null)
        .order("name")
        .limit(max + 1),
      latestCounts(supabase),
      supabase.from("assignments").select("company_id, salesperson_id, role"),
      supabase.from("profiles").select("id, full_name"),
    ]);
  const spName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const ownerOf = new Map<string, string>();
  for (const a of assignments ?? [])
    if ((a.role ?? "owner") === "owner" && !ownerOf.has(a.company_id))
      ownerOf.set(a.company_id, spName.get(a.salesperson_id) ?? "");

  let list = (dealers ?? []) as { id: string; name: string; city: string | null; logo_code: string | null; segment: string | null }[];
  if (f.sp) list = list.filter((d) => (assignments ?? []).some((a) => a.company_id === d.id && a.salesperson_id === f.sp));
  if (f.segment) list = list.filter((d) => d.segment === f.segment);
  const capped = list.length > max;
  if (capped) list = list.slice(0, max);

  const headers = [
    "Bayi",
    "Logo Kodu",
    "Şehir",
    "Sorumlu",
    "Son Sayım",
    "Kaç Gün Önce",
    "Sayan",
    ...skus.map((s) => s.code),
    "Toplam Palet",
    "Not",
  ];
  const rows: SheetRow[] = list.map((d) => {
    const c = latest.get(d.id);
    const row: SheetRow = {
      Bayi: d.name,
      "Logo Kodu": d.logo_code ?? "",
      Şehir: d.city ?? "",
      Sorumlu: ownerOf.get(d.id) ?? "",
      "Son Sayım": c ? formatTRDate(c.countedAt) : "",
      "Kaç Gün Önce": c ? daysSince(c.countedAt) : null,
      Sayan: c?.salesperson ?? "",
    };
    for (const s of skus) row[s.code] = c ? c.lines[s.id] ?? 0 : null;
    row["Toplam Palet"] = c ? c.total : null;
    row.Not = c?.note ?? "";
    return row;
  });
  return { sheetName: "Stok Durumu", headers, rows, capped };
};

// ---------------------------------------------------------------------------
// Özel Rapor (anket) cevapları — one survey, a column per question
// ---------------------------------------------------------------------------
export const buildAnket: Builder = async (supabase, f, opts) => {
  const max = opts?.limit ?? ROW_CAP;
  let surveyId = f.survey;
  if (!surveyId) {
    // Default: the most recently updated active survey.
    const { data: s } = await supabase
      .from("surveys")
      .select("id")
      .order("status")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    surveyId = s?.id;
  }
  if (!surveyId)
    return { sheetName: "Özel Rapor", headers: ["Bilgi"], rows: [{ Bilgi: "Özel rapor yok." }] };

  const [{ data: survey }, { data: questions }] = await Promise.all([
    supabase.from("surveys").select("name").eq("id", surveyId).maybeSingle(),
    supabase.from("survey_questions").select("*").eq("survey_id", surveyId).order("sort_order"),
  ]);
  const qs = (questions as SurveyQuestion[] | null) ?? [];

  let q = supabase
    .from("survey_answers")
    .select("id, answered_at, answers, companies(name, kind, city), salesperson:salesperson_id(full_name)")
    .eq("survey_id", surveyId)
    .order("answered_at", { ascending: false })
    .limit(max + 1);
  if (f.start) q = q.gte("answered_at", f.start);
  if (f.end) q = q.lte("answered_at", f.end);
  if (f.sp) q = q.eq("salesperson_id", f.sp);
  const { data } = await q;
  const all = (data ?? []) as Record<string, unknown>[];
  const capped = all.length > max;
  const list = capped ? all.slice(0, max) : all;

  const headers = ["Tarih", "Firma", "Tür", "Şehir", "Pazarlamacı", ...qs.map((x) => x.prompt)];
  const rows: SheetRow[] = list.map((a) => {
    const co = one(a.companies as { name: string; kind: CompanyKind; city: string | null } | null);
    const sp = one(a.salesperson as { full_name: string } | null);
    const ans = (a.answers ?? {}) as Record<string, unknown>;
    const row: SheetRow = {
      Tarih: formatTRDate(a.answered_at as string),
      Firma: co?.name ?? "",
      Tür: co ? COMPANY_KIND_LABELS[co.kind] : "",
      Şehir: co?.city ?? "",
      Pazarlamacı: sp?.full_name ?? "",
    };
    for (const x of qs) {
      const v = formatSurveyAnswer(x.input_type, x.options, ans[x.id]);
      row[x.prompt] = v === "—" ? "" : v;
    }
    return row;
  });
  return {
    sheetName: (survey?.name as string | undefined)?.slice(0, 28) ?? "Özel Rapor",
    headers,
    rows,
    capped,
  };
};

// ---------------------------------------------------------------------------
// Hedefler — dealer × sales category quantity targets vs. shipments
// ---------------------------------------------------------------------------
export const buildHedef: Builder = async (supabase, f, opts) => {
  const max = opts?.limit ?? ROW_CAP;
  const today = todayIso();
  const year = Number(f.year) || Number(today.slice(0, 4));
  const [targets, thresholds, { data: dealers }, categories, shipments] = await Promise.all([
    targetsForYear(supabase, year),
    getPaceThresholds(),
    supabase
      .from("companies")
      .select("id, name, logo_code, city")
      .eq("kind", "distributor")
      .is("deleted_at", null)
      .order("name")
      .limit(5000),
    loadSalesCategories(supabase),
    shipmentTotalsForYear(supabase, year),
  ]);

  const headers = [
    "Bayi",
    "Logo Kodu",
    "Şehir",
    "Yıl",
    "Durum",
    "Kategori",
    "Birim",
    "Hedef",
    "Sevk",
    "Kalan",
    "Gerçekleşme %",
    "Tempo",
  ];
  const rows: SheetRow[] = [];
  for (const d of (dealers ?? []) as { id: string; name: string; logo_code: string | null; city: string | null }[]) {
    const t = targets.get(d.id) ?? null;
    const ship = shipments.get(d.id) ?? null;
    if (!t && !ship) continue;
    const st = buildTargetStatus(t?.lines ?? [], categories, ship, year, today, thresholds);
    if (st.lines.length === 0) continue;
    const base = {
      Bayi: d.name,
      "Logo Kodu": d.logo_code ?? "",
      Şehir: d.city ?? "",
      Yıl: year,
      Durum: t ? TARGET_STATUS_LABELS[t.status] : "Hedef yok",
    };
    const round = (n: number) => Math.round(n * 10) / 10;
    for (const l of st.lines) {
      rows.push({
        ...base,
        Kategori: l.category.label_tr,
        Birim: l.category.unit,
        Hedef: round(l.target),
        Sevk: round(l.shipped),
        Kalan: l.target > 0 ? round(l.remaining) : null,
        "Gerçekleşme %": l.pace.ratio == null ? null : Math.round(l.pace.ratio * 100),
        Tempo: l.pace.pace ? PACE_LABELS[l.pace.pace] : "",
      });
      if (l.monthly) {
        for (let i = 0; i < 12; i++) {
          if (!l.monthly[i] && !l.byMonth[i]) continue;
          rows.push({
            ...base,
            Kategori: `${l.category.label_tr} · ${MONTHS_TR_SHORT[i]}`,
            Birim: l.category.unit,
            Hedef: round(l.monthly[i]),
            Sevk: round(l.byMonth[i]),
            Kalan: round(Math.max(0, l.monthly[i] - l.byMonth[i])),
            "Gerçekleşme %": l.monthly[i] > 0 ? Math.round((l.byMonth[i] / l.monthly[i]) * 100) : null,
            Tempo: "",
          });
        }
      }
    }
    rows.push({
      ...base,
      Kategori: "SEVK EDİLEN €",
      Birim: "€",
      Hedef: null,
      Sevk: Math.round(st.eur * 100) / 100,
      Kalan: null,
      "Gerçekleşme %": null,
      Tempo: st.pace ? PACE_LABELS[st.pace] : "",
    });
    if (rows.length >= max) break;
  }
  return { sheetName: `Hedefler ${year}`, headers, rows: rows.slice(0, max), capped: rows.length > max };
};
