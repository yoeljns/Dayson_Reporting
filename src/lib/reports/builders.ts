import type { SupabaseClient } from "@supabase/supabase-js";
import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  VISIT_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_STATUSES,
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_OWNER_DEPT_LABELS,
  COMPLAINT_OWNER_DEPTS,
  COMPLAINT_PRIORITY_LABELS,
  DEBT_STATUS_LABELS,
  SUPPLY_KIND_LABELS,
  SEGMENTS,
  COMPANY_KINDS,
  type VisitType,
  type VisitStatus,
  type ComplaintType,
  type ComplaintStatus,
  type ComplaintOwnerDept,
  type DebtStatus,
} from "@/lib/enums";
import {
  formatTRDate,
  weekRangeLabel,
  weekStartOf,
  currentWeekStart,
  daysSince,
} from "@/lib/week";
import {
  ROW_CAP,
  COVERAGE_CAP,
  resolveRange,
  nextDayIso,
  type ReportFilters,
  type RangeMode,
} from "@/lib/reports/filters";
import type { Cell, SheetRow } from "@/lib/reports/sheet";

export type BuildResult = {
  sheetName: string;
  headers: string[];
  rows: SheetRow[];
  capped?: boolean;
};

export type BuildOpts = { limit?: number };
export type ReportBuilder = (
  supabase: SupabaseClient,
  f: ReportFilters,
  opts?: BuildOpts
) => Promise<BuildResult>;

/** Default date-range behaviour per report (used by builders AND the page UI). */
export const REPORT_RANGE_MODE: Record<string, RangeMode> = {
  ziyaret: "d30",
  performans: "month",
  sikayet: "d30",
  rakip: "d30",
  kapsama: "none",
  plan: "week",
  marka: "d30",
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Supabase embeds a to-one relation as an object or a 1-element array. */
function one<T>(r: T | T[] | null | undefined): T | null {
  if (Array.isArray(r)) return r[0] ?? null;
  return r ?? null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type QuestionRow = {
  id: string;
  code: string;
  label_tr: string;
  input_type: string;
  question_options: { value: string; label_tr: string }[] | null;
};
type AnswerRow = {
  question_id: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
};

/** Resolve one visit-answer cell to its human value based on the question type. */
function resolveAnswer(
  q: QuestionRow,
  a: AnswerRow | undefined,
  opts: Map<string, string> | undefined
): Cell {
  if (!a) return null;
  switch (q.input_type) {
    case "number":
      return a.value_number ?? null;
    case "date":
      return a.value_date ? formatTRDate(a.value_date) : null;
    case "boolean":
      if (a.value_text === "evet") return "Evet";
      if (a.value_text === "hayir") return "Hayır";
      return a.value_text ?? null;
    case "select":
      return a.value_text ? opts?.get(a.value_text) ?? a.value_text : null;
    case "multiselect":
      if (!a.value_text) return null;
      return a.value_text
        .split(",")
        .map((s) => opts?.get(s.trim()) ?? s.trim())
        .join(", ");
    default:
      return a.value_text ?? null; // text
  }
}

// ---------------------------------------------------------------------------
// 1) Ziyaret Raporu — visits + dynamic Q&A pivot
// ---------------------------------------------------------------------------
export const buildZiyaret: ReportBuilder = async (supabase, f, opts) => {
  const max = opts?.limit ?? ROW_CAP;
  const { start, end } = resolveRange(f, "d30");

  let q = supabase
    .from("visits")
    .select(
      "id, visit_date, visit_type, status, companies!inner(name, city, kind, segment), salesperson:salesperson_id(full_name)"
    )
    .is("deleted_at", null)
    .gte("visit_date", start)
    .lte("visit_date", end)
    .order("visit_date", { ascending: false })
    .limit(max + 1);
  if (f.sp) q = q.eq("salesperson_id", f.sp);
  if (f.status && (VISIT_STATUSES as readonly string[]).includes(f.status))
    q = q.eq("status", f.status);
  if (f.kind && (COMPANY_KINDS as readonly string[]).includes(f.kind))
    q = q.eq("companies.kind", f.kind);

  const { data } = await q;
  const all = (data ?? []) as Record<string, unknown>[];
  const capped = all.length > max;
  const visits = capped ? all.slice(0, max) : all;

  // Active question catalog (column order) + option label maps.
  const { data: qs } = await supabase
    .from("questions")
    .select("id, code, label_tr, input_type, question_options(value, label_tr)")
    .eq("is_active", true)
    .order("sort_order");
  const questions = (qs ?? []) as QuestionRow[];
  const optMaps = new Map<string, Map<string, string>>();
  for (const ques of questions) {
    const m = new Map<string, string>();
    for (const o of ques.question_options ?? []) m.set(o.value, o.label_tr);
    optMaps.set(ques.id, m);
  }

  // Answers for the visit window, grouped by visit.
  const visitIds = visits.map((v) => v.id as string);
  const answersByVisit = new Map<string, Map<string, AnswerRow>>();
  for (const ids of chunk(visitIds, 500)) {
    if (ids.length === 0) continue;
    const { data: ans } = await supabase
      .from("visit_answers")
      .select("visit_id, question_id, value_text, value_number, value_date")
      .in("visit_id", ids);
    for (const a of (ans ?? []) as (AnswerRow & { visit_id: string })[]) {
      let m = answersByVisit.get(a.visit_id);
      if (!m) {
        m = new Map();
        answersByVisit.set(a.visit_id, m);
      }
      m.set(a.question_id, a);
    }
  }

  // Disambiguate question labels that collide with each other OR with a fixed
  // column header (labels are admin-editable) by appending the unique code.
  const fixed = ["Tarih", "Firma", "Şehir", "Tür", "Pazarlamacı", "Durum"];
  const labelCount = new Map<string, number>();
  for (const fx of fixed) labelCount.set(fx, (labelCount.get(fx) ?? 0) + 1);
  for (const ques of questions)
    labelCount.set(ques.label_tr, (labelCount.get(ques.label_tr) ?? 0) + 1);
  const headerFor = (ques: QuestionRow) =>
    (labelCount.get(ques.label_tr) ?? 0) > 1
      ? `${ques.label_tr} (${ques.code})`
      : ques.label_tr;

  const headers = [...fixed, ...questions.map(headerFor)];

  const rows: SheetRow[] = visits.map((v) => {
    const company = one(v.companies as { name?: string; city?: string } | null);
    const sp = one(v.salesperson as { full_name?: string } | null);
    const row: SheetRow = {
      Tarih: formatTRDate(v.visit_date as string),
      Firma: company?.name ?? "",
      Şehir: company?.city ?? "",
      Tür: VISIT_TYPE_LABELS[v.visit_type as VisitType] ?? (v.visit_type as string),
      Pazarlamacı: sp?.full_name ?? "",
      Durum:
        VISIT_STATUS_LABELS[v.status as VisitStatus] ?? (v.status as string),
    };
    const am = answersByVisit.get(v.id as string);
    for (const ques of questions)
      row[headerFor(ques)] = resolveAnswer(ques, am?.get(ques.id), optMaps.get(ques.id));
    return row;
  });

  return { sheetName: "Ziyaretler", headers, rows, capped };
};

// ---------------------------------------------------------------------------
// 2) Pazarlamacı Performans Özeti — per-rep aggregate
// ---------------------------------------------------------------------------
export const buildPerformans: ReportBuilder = async (supabase, f, opts) => {
  const { start, end } = resolveRange(f, "month");
  const endNext = nextDayIso(end);

  const [{ data: sps }, { data: visits }, { data: comps }, { data: obs }, { data: plans }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .eq("role", "salesperson")
        .order("full_name"),
      supabase
        .from("visits")
        .select("salesperson_id, status, visit_date")
        .is("deleted_at", null)
        .gte("visit_date", start)
        .lte("visit_date", end)
        .order("visit_date", { ascending: false })
        .limit(ROW_CAP + 1),
      supabase
        .from("complaints")
        .select("reported_by, created_at")
        .eq("is_draft", false)
        .gte("created_at", start)
        .lt("created_at", endNext)
        .order("created_at", { ascending: false })
        .limit(ROW_CAP + 1),
      supabase
        .from("competitor_observations")
        .select("salesperson_id, observed_at")
        .eq("is_draft", false)
        .gte("observed_at", start)
        .lte("observed_at", end)
        .order("observed_at", { ascending: false })
        .limit(ROW_CAP + 1),
      supabase
        .from("visit_plans")
        .select("salesperson_id, submitted_at")
        .eq("status", "gonderildi")
        .gte("submitted_at", start)
        .lt("submitted_at", endNext)
        .order("submitted_at", { ascending: false })
        .limit(ROW_CAP + 1),
    ]);

  // If any source hit the cap the per-rep aggregates are partial — flag it so
  // the export appends a "Bilgi" warning sheet.
  const capped =
    (visits?.length ?? 0) > ROW_CAP ||
    (comps?.length ?? 0) > ROW_CAP ||
    (obs?.length ?? 0) > ROW_CAP ||
    (plans?.length ?? 0) > ROW_CAP;

  type Agg = {
    name: string;
    done: number;
    draft: number;
    complaints: number;
    obs: number;
    plans: number;
    last: string | null;
  };
  const map = new Map<string, Agg>();
  for (const s of (sps ?? []) as { id: string; full_name: string }[])
    map.set(s.id, {
      name: s.full_name,
      done: 0,
      draft: 0,
      complaints: 0,
      obs: 0,
      plans: 0,
      last: null,
    });
  const touch = (r: Agg, d: string | null) => {
    if (d && (!r.last || d > r.last)) r.last = d;
  };

  for (const v of ((visits ?? []) as {
    salesperson_id: string;
    status: string;
    visit_date: string;
  }[]).slice(0, ROW_CAP)) {
    const r = map.get(v.salesperson_id);
    if (!r) continue;
    if (v.status === "tamamlandi") r.done++;
    else r.draft++;
    touch(r, v.visit_date);
  }
  for (const c of ((comps ?? []) as { reported_by: string; created_at: string }[]).slice(
    0,
    ROW_CAP
  )) {
    const r = map.get(c.reported_by);
    if (!r) continue;
    r.complaints++;
    touch(r, c.created_at?.slice(0, 10) ?? null);
  }
  for (const o of ((obs ?? []) as {
    salesperson_id: string;
    observed_at: string;
  }[]).slice(0, ROW_CAP)) {
    const r = map.get(o.salesperson_id);
    if (!r) continue;
    r.obs++;
    touch(r, o.observed_at);
  }
  for (const p of ((plans ?? []) as {
    salesperson_id: string;
    submitted_at: string;
  }[]).slice(0, ROW_CAP)) {
    const r = map.get(p.salesperson_id);
    if (!r) continue;
    r.plans++;
    touch(r, p.submitted_at?.slice(0, 10) ?? null);
  }

  const headers = [
    "Pazarlamacı",
    "Tamamlanan Ziyaret",
    "Taslak",
    "Açılan Şikayet",
    "Rakip Gözlemi",
    "Gönderilen Plan",
    "Son Aktivite",
  ];
  let rows: SheetRow[] = [...map.values()]
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, "tr"))
    .map((r) => ({
      Pazarlamacı: r.name,
      "Tamamlanan Ziyaret": r.done,
      Taslak: r.draft,
      "Açılan Şikayet": r.complaints,
      "Rakip Gözlemi": r.obs,
      "Gönderilen Plan": r.plans,
      "Son Aktivite": r.last ? formatTRDate(r.last) : null,
    }));
  if (opts?.limit) rows = rows.slice(0, opts.limit);
  return { sheetName: "Performans", headers, rows, capped };
};

// ---------------------------------------------------------------------------
// 3) Şikayet Raporu — with aging
// ---------------------------------------------------------------------------
export const buildSikayet: ReportBuilder = async (supabase, f, opts) => {
  const max = opts?.limit ?? ROW_CAP;
  const { start, end } = resolveRange(f, "d30");
  const endNext = nextDayIso(end);

  let q = supabase
    .from("complaints")
    .select(
      "id, title, type, status, owner_dept, priority, created_at, due_date, resolved_at, complainant_name, companies(name), reporter:reported_by(full_name), assignee:assignee_id(full_name)"
    )
    .eq("is_draft", false)
    .gte("created_at", start)
    .lt("created_at", endNext)
    .order("created_at", { ascending: false })
    .limit(max + 1);
  if (f.status && (COMPLAINT_STATUSES as readonly string[]).includes(f.status))
    q = q.eq("status", f.status);
  if (f.dept && (COMPLAINT_OWNER_DEPTS as readonly string[]).includes(f.dept))
    q = q.eq("owner_dept", f.dept);

  const { data } = await q;
  const all = (data ?? []) as Record<string, unknown>[];
  const capped = all.length > max;
  const list = capped ? all.slice(0, max) : all;

  const headers = [
    "Oluşturma",
    "Başlık",
    "Tür",
    "Departman",
    "Öncelik",
    "Durum",
    "Firma/Şikayetçi",
    "Bildiren",
    "Atanan",
    "Son Tarih",
    "Çözüm Tarihi",
    "Açık Gün",
    "Çözüm Süresi (gün)",
  ];
  const rows: SheetRow[] = list.map((c) => {
    const company = one(c.companies as { name?: string } | null);
    const rep = one(c.reporter as { full_name?: string } | null);
    const asg = one(c.assignee as { full_name?: string } | null);
    const createdIso = (c.created_at as string | null)?.slice(0, 10) ?? null;
    const resolvedIso = (c.resolved_at as string | null)?.slice(0, 10) ?? null;
    const status = c.status as ComplaintStatus;
    const closed = status === "cozuldu" || status === "iptal";
    return {
      Oluşturma: createdIso ? formatTRDate(createdIso) : null,
      Başlık: c.title as string,
      Tür: COMPLAINT_TYPE_LABELS[c.type as ComplaintType] ?? (c.type as string),
      Departman:
        COMPLAINT_OWNER_DEPT_LABELS[c.owner_dept as ComplaintOwnerDept] ??
        (c.owner_dept as string),
      Öncelik:
        COMPLAINT_PRIORITY_LABELS[c.priority as number] ?? String(c.priority),
      Durum: COMPLAINT_STATUS_LABELS[status] ?? (status as string),
      "Firma/Şikayetçi":
        company?.name ?? (c.complainant_name as string | null) ?? "",
      Bildiren: rep?.full_name ?? "",
      Atanan: asg?.full_name ?? "",
      "Son Tarih": c.due_date ? formatTRDate(c.due_date as string) : null,
      "Çözüm Tarihi": resolvedIso ? formatTRDate(resolvedIso) : null,
      "Açık Gün": closed ? null : daysSince(createdIso),
      "Çözüm Süresi (gün)":
        resolvedIso && createdIso
          ? differenceInCalendarDays(parseISO(resolvedIso), parseISO(createdIso))
          : null,
    };
  });

  return { sheetName: "Şikayetler", headers, rows, capped };
};

// ---------------------------------------------------------------------------
// 4) Rakip Fiyat Raporu
// ---------------------------------------------------------------------------
export const buildRakip: ReportBuilder = async (supabase, f, opts) => {
  const max = opts?.limit ?? ROW_CAP;
  const { start, end } = resolveRange(f, "d30");

  let q = supabase
    .from("competitor_observations")
    .select(
      "observed_at, product_name, observed_price, currency, city, note, competitors(name), companies(name), salesperson:salesperson_id(full_name)"
    )
    .eq("is_draft", false)
    .gte("observed_at", start)
    .lte("observed_at", end)
    .order("observed_at", { ascending: false })
    .limit(max + 1);
  if (f.competitor) q = q.eq("competitor_id", f.competitor);

  const { data } = await q;
  const all = (data ?? []) as Record<string, unknown>[];
  const capped = all.length > max;
  const list = capped ? all.slice(0, max) : all;

  const headers = [
    "Tarih",
    "Rakip",
    "Ürün",
    "Fiyat",
    "Para Birimi",
    "Şehir",
    "Firma",
    "Pazarlamacı",
    "Not",
  ];
  const rows: SheetRow[] = list.map((o) => {
    const comp = one(o.competitors as { name?: string } | null);
    const company = one(o.companies as { name?: string } | null);
    const sp = one(o.salesperson as { full_name?: string } | null);
    return {
      Tarih: o.observed_at ? formatTRDate(o.observed_at as string) : null,
      Rakip: comp?.name ?? "",
      Ürün: o.product_name as string,
      Fiyat: (o.observed_price as number | null) ?? null,
      "Para Birimi": (o.currency as string) ?? "",
      Şehir: (o.city as string | null) ?? "",
      Firma: company?.name ?? "",
      Pazarlamacı: sp?.full_name ?? "",
      Not: (o.note as string | null) ?? "",
    };
  });

  return { sheetName: "Rakip Fiyat", headers, rows, capped };
};

// ---------------------------------------------------------------------------
// 5) Bayi Kapsama / Son Ziyaret — snapshot
// ---------------------------------------------------------------------------
export const buildKapsama: ReportBuilder = async (supabase, f, opts) => {
  // Push the segment filter into the query so the row cap applies to the
  // filtered population, not the first N dealers alphabetically.
  let companiesQ = supabase
    .from("companies")
    .select("id, name, city, segment, debt_status")
    .eq("kind", "distributor")
    .is("deleted_at", null);
  if (f.segment && (SEGMENTS as readonly string[]).includes(f.segment))
    companiesQ = companiesQ.eq("segment", f.segment);
  companiesQ = companiesQ.order("name").limit(COVERAGE_CAP + 1);

  const [{ data: companies }, { data: assignments }, { data: profiles }, { data: lv }] =
    await Promise.all([
      companiesQ,
      supabase.from("assignments").select("company_id, salesperson_id"),
      supabase.from("profiles").select("id, full_name"),
      supabase
        .from("company_last_visit")
        .select("company_id, last_visit_date, visit_count"),
    ]);

  const allCompanies = (companies ?? []) as {
    id: string;
    name: string;
    city: string | null;
    segment: string | null;
    debt_status: string | null;
  }[];
  const capped = allCompanies.length > COVERAGE_CAP;
  let comps = capped ? allCompanies.slice(0, COVERAGE_CAP) : allCompanies;

  const spName = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name])
  );
  // A company can have several salespeople (assignments unique is composite).
  const assignedTo = new Map<string, string[]>();
  for (const a of (assignments ?? []) as {
    company_id: string;
    salesperson_id: string;
  }[]) {
    const arr = assignedTo.get(a.company_id) ?? [];
    arr.push(a.salesperson_id);
    assignedTo.set(a.company_id, arr);
  }
  const lastMap = new Map(
    (lv ?? []).map(
      (r: { company_id: string; last_visit_date: string | null; visit_count: number }) => [
        r.company_id,
        r,
      ]
    )
  );

  if (f.sp) comps = comps.filter((c) => (assignedTo.get(c.id) ?? []).includes(f.sp!));

  const enriched = comps.map((c) => ({
    c,
    last: (lastMap.get(c.id)?.last_visit_date as string | null) ?? null,
    count: Number(lastMap.get(c.id)?.visit_count ?? 0),
  }));
  // Never-visited first, then oldest.
  enriched.sort((a, b) => {
    if (a.last === b.last) return a.c.name.localeCompare(b.c.name, "tr");
    if (!a.last) return -1;
    if (!b.last) return 1;
    return a.last < b.last ? -1 : 1;
  });

  const headers = [
    "Bayi",
    "Şehir",
    "Segment",
    "Borç Durumu",
    "Pazarlamacı",
    "Son Ziyaret",
    "Geçen Gün",
    "Ziyaret Sayısı",
    "Hiç Ziyaret Edilmedi",
  ];
  let rows: SheetRow[] = enriched.map(({ c, last, count }) => {
    const reps = (assignedTo.get(c.id) ?? [])
      .map((id) => spName.get(id))
      .filter(Boolean)
      .join(", ");
    return {
      Bayi: c.name,
      Şehir: c.city ?? "",
      Segment: c.segment ?? "",
      "Borç Durumu": c.debt_status
        ? DEBT_STATUS_LABELS[c.debt_status as DebtStatus] ?? c.debt_status
        : "",
      Pazarlamacı: reps,
      "Son Ziyaret": last ? formatTRDate(last) : null,
      "Geçen Gün": daysSince(last),
      "Ziyaret Sayısı": count,
      "Hiç Ziyaret Edilmedi": last ? "" : "Evet",
    };
  });
  if (opts?.limit) rows = rows.slice(0, opts.limit);
  return { sheetName: "Bayi Kapsama", headers, rows, capped };
};

// ---------------------------------------------------------------------------
// 6) Haftalık Plan Raporu — plans + items flattened
// ---------------------------------------------------------------------------
export const buildPlan: ReportBuilder = async (supabase, f, opts) => {
  const start = f.start ? weekStartOf(parseISO(f.start)) : currentWeekStart();
  const end = f.end ? weekStartOf(parseISO(f.end)) : start;

  let q = supabase
    .from("visit_plans")
    .select(
      "week_start, status, salesperson:salesperson_id(full_name), visit_plan_items(planned_date, visit_type, note, company_id, companies(name))"
    )
    .gte("week_start", start)
    .lte("week_start", end)
    .order("week_start", { ascending: false })
    .limit(ROW_CAP);
  if (f.sp) q = q.eq("salesperson_id", f.sp);

  const { data } = await q;
  const plans = (data ?? []) as Record<string, unknown>[];

  const companyIds = new Set<string>();
  for (const p of plans)
    for (const it of (p.visit_plan_items as { company_id?: string }[]) ?? [])
      if (it.company_id) companyIds.add(it.company_id);
  const lastMap = new Map<string, string | null>();
  for (const ids of chunk([...companyIds], 500)) {
    if (ids.length === 0) continue;
    const { data: lv } = await supabase
      .from("company_last_visit")
      .select("company_id, last_visit_date")
      .in("company_id", ids);
    for (const r of (lv ?? []) as { company_id: string; last_visit_date: string | null }[])
      lastMap.set(r.company_id, r.last_visit_date);
  }

  const headers = [
    "Hafta",
    "Pazarlamacı",
    "Durum",
    "Planlanan Firma",
    "Gün",
    "Tür",
    "Son Ziyaret",
    "Not",
  ];
  const rows: SheetRow[] = [];
  for (const p of plans) {
    const sp = one(p.salesperson as { full_name?: string } | null);
    const week = weekRangeLabel(p.week_start as string);
    const durum =
      p.status === "gonderildi" ? "Gönderildi" : "Taslak";
    const items =
      (p.visit_plan_items as {
        planned_date: string | null;
        visit_type: string | null;
        note: string | null;
        company_id: string | null;
        companies: { name?: string } | { name?: string }[] | null;
      }[]) ?? [];
    if (items.length === 0) {
      rows.push({
        Hafta: week,
        Pazarlamacı: sp?.full_name ?? "",
        Durum: durum,
        "Planlanan Firma": "",
        Gün: null,
        Tür: "",
        "Son Ziyaret": null,
        Not: "",
      });
      continue;
    }
    for (const it of items) {
      const company = one(it.companies);
      const last = it.company_id ? lastMap.get(it.company_id) ?? null : null;
      rows.push({
        Hafta: week,
        Pazarlamacı: sp?.full_name ?? "",
        Durum: durum,
        "Planlanan Firma": company?.name ?? "",
        Gün: it.planned_date ? formatTRDate(it.planned_date) : null,
        Tür: it.visit_type
          ? VISIT_TYPE_LABELS[it.visit_type as VisitType] ?? it.visit_type
          : "",
        "Son Ziyaret": last ? formatTRDate(last) : null,
        Not: it.note ?? "",
      });
    }
  }
  const max = opts?.limit ?? ROW_CAP;
  const capped = rows.length > max;
  const limited = capped ? rows.slice(0, max) : rows;
  return { sheetName: "Haftalık Plan", headers, rows: limited, capped };
};

// ---------------------------------------------------------------------------
// 7) Marka Rekabeti — per category × brand: how many dealers buy each brand
// ---------------------------------------------------------------------------
export const buildMarka: ReportBuilder = async (supabase, f, opts) => {
  const max = opts?.limit ?? ROW_CAP;
  const { start, end } = resolveRange(f, "d30");
  const headers = ["Kategori", "Marka", "Biz/Rakip", "Bayi Sayısı", "Gözlem Sayısı"];

  // Matching visits (date/salesperson/segment) → visit → company map.
  let vq = supabase
    .from("visits")
    .select("id, company_id, companies!inner(segment)")
    .is("deleted_at", null)
    .gte("visit_date", start)
    .lte("visit_date", end)
    .order("visit_date", { ascending: false })
    .limit(ROW_CAP + 1);
  if (f.sp) vq = vq.eq("salesperson_id", f.sp);
  if (f.segment && (SEGMENTS as readonly string[]).includes(f.segment))
    vq = vq.eq("companies.segment", f.segment);
  const { data: visitsData } = await vq;
  const vlist = (visitsData ?? []) as { id: string; company_id: string }[];
  let capped = vlist.length > ROW_CAP;
  const vrows = capped ? vlist.slice(0, ROW_CAP) : vlist;
  const visitCompany = new Map(vrows.map((v) => [v.id, v.company_id]));
  const visitIds = vrows.map((v) => v.id);
  if (visitIds.length === 0) return { sheetName: "Marka Rekabeti", headers, rows: [] };

  // Global own/competitor map per (category, brand).
  const { data: globals } = await supabase
    .from("product_category_brands")
    .select("category_id, brand_id, is_own")
    .is("salesperson_id", null);
  const ownMap = new Map(
    ((globals ?? []) as { category_id: string; brand_id: string; is_own: boolean }[]).map(
      (g) => [`${g.category_id}|${g.brand_id}`, g.is_own]
    )
  );

  type Ans = {
    visit_id: string;
    category_id: string;
    brand_id: string | null;
    supply_kind: string;
    product_categories: { label_tr: string; sort_order: number } | { label_tr: string; sort_order: number }[] | null;
    product_brands: { name: string } | { name: string }[] | null;
  };
  const answers: Ans[] = [];
  for (const ids of chunk(visitIds, 500)) {
    if (ids.length === 0) continue;
    let pq = supabase
      .from("visit_product_answers")
      .select(
        "visit_id, category_id, brand_id, supply_kind, product_categories(label_tr, sort_order), product_brands(name)"
      )
      .in("visit_id", ids);
    if (f.category) pq = pq.eq("category_id", f.category);
    const { data } = await pq;
    answers.push(...((data ?? []) as Ans[]));
  }

  type Agg = {
    catLabel: string;
    catSort: number;
    brand: string;
    isOwn: boolean | null;
    special: boolean;
    companies: Set<string>;
    count: number;
  };
  const map = new Map<string, Agg>();
  for (const a of answers) {
    const cat = one(a.product_categories);
    const br = one(a.product_brands);
    const special = a.supply_kind !== "brand";
    const key = `${a.category_id}|${special ? a.supply_kind : a.brand_id}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        catLabel: cat?.label_tr ?? "?",
        catSort: cat?.sort_order ?? 0,
        brand: special
          ? SUPPLY_KIND_LABELS[a.supply_kind as keyof typeof SUPPLY_KIND_LABELS] ??
            a.supply_kind
          : br?.name ?? "?",
        isOwn: special ? null : ownMap.get(`${a.category_id}|${a.brand_id}`) ?? false,
        special,
        companies: new Set<string>(),
        count: 0,
      };
      map.set(key, agg);
    }
    const companyId = visitCompany.get(a.visit_id);
    if (companyId) agg.companies.add(companyId);
    agg.count++;
  }

  let rows: SheetRow[] = [...map.values()]
    .sort(
      (a, b) =>
        a.catSort - b.catSort ||
        Number(b.isOwn) - Number(a.isOwn) ||
        b.companies.size - a.companies.size
    )
    .map((a) => ({
      Kategori: a.catLabel,
      Marka: a.brand,
      "Biz/Rakip": a.special ? "-" : a.isOwn ? "Biz" : "Rakip",
      "Bayi Sayısı": a.companies.size,
      "Gözlem Sayısı": a.count,
    }));
  if (rows.length > max) {
    capped = true;
    rows = rows.slice(0, max);
  }
  return { sheetName: "Marka Rekabeti", headers, rows, capped };
};
