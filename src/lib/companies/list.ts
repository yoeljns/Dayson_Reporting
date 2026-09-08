import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANY_KINDS, SEGMENTS, type CompanyKind, type Segment } from "@/lib/enums";
import { groupAssignments, type CompanyReps } from "@/lib/assignments";
import { daysSince } from "@/lib/week";

/**
 * Shared company-list filtering + ordering used by the rep list (/firmalar),
 * the office list (/admin/firmalar) and the Önceki / Sıradaki navigation on
 * detail pages, so "next" always means "next row of the list you came from".
 */
export type CompanySort = "ad" | "ziyaret" | "sehir";
export const COMPANY_SORTS: { key: CompanySort; label: string }[] = [
  { key: "ad", label: "Ad" },
  { key: "ziyaret", label: "Son ziyaret" },
  { key: "sehir", label: "Şehir" },
];
export type VisitAge = "30" | "60" | "90" | "yok";
export const VISIT_AGES: { key: VisitAge; label: string }[] = [
  { key: "30", label: "30+ gün" },
  { key: "60", label: "60+ gün" },
  { key: "90", label: "90+ gün" },
  { key: "yok", label: "Hiç ziyaret yok" },
];

export type CompanyListParams = {
  q?: string | null;
  tur?: string | null;
  /** "yok" = unassigned only. */
  atama?: string | null;
  /** Salesperson id — owner or backup. */
  sp?: string | null;
  /** Two-digit plate code, otherwise a city name. */
  bolge?: string | null;
  segment?: string | null;
  /** Days since last visit ("30" | "60" | "90") or "yok" (never visited). */
  ziyaret?: string | null;
  sirala?: string | null;
};
const LIST_KEYS = ["q", "tur", "atama", "sp", "bolge", "segment", "ziyaret", "sirala"] as const;

export function parseKind(v?: string | null): CompanyKind | null {
  return (COMPANY_KINDS as readonly string[]).includes(v ?? "") ? (v as CompanyKind) : null;
}
export function parseSort(v?: string | null): CompanySort {
  return v === "ziyaret" || v === "sehir" ? v : "ad";
}
export function parseSegment(v?: string | null): Segment | null {
  const s = (v ?? "").toUpperCase();
  return (SEGMENTS as readonly string[]).includes(s) ? (s as Segment) : null;
}
export function parseVisitAge(v?: string | null): VisitAge | null {
  return v === "30" || v === "60" || v === "90" || v === "yok" ? v : null;
}

/** Pick the known list keys out of a page's searchParams. */
export function parseListParams(sp: Record<string, string | string[] | undefined>): CompanyListParams {
  const out: CompanyListParams = {};
  for (const k of LIST_KEYS) {
    const v = sp[k];
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

/** True when the URL carries any list parameter (came from a list). */
export function hasListParams(sp: Record<string, string | string[] | undefined>): boolean {
  return LIST_KEYS.some((k) => typeof sp[k] === "string");
}

/** "q=…&tur=…&sirala=…" (no leading "?"), empty when nothing is set. */
export function listQueryString(p: CompanyListParams): string {
  const sp = new URLSearchParams();
  const q = (p.q ?? "").trim();
  if (q) sp.set("q", q);
  const k = parseKind(p.tur);
  if (k) sp.set("tur", k);
  if (p.atama === "yok") sp.set("atama", "yok");
  if (p.sp) sp.set("sp", p.sp);
  const b = (p.bolge ?? "").trim();
  if (b) sp.set("bolge", b);
  const seg = parseSegment(p.segment);
  if (seg) sp.set("segment", seg);
  const age = parseVisitAge(p.ziyaret);
  if (age) sp.set("ziyaret", age);
  const sort = parseSort(p.sirala);
  if (sort !== "ad") sp.set("sirala", sort);
  return sp.toString();
}

/** Join a path with query fragments, skipping empty ones. */
export function withQuery(path: string, ...parts: (string | null | undefined)[]): string {
  const qs = parts.filter((s) => s && s.length > 0).join("&");
  return qs ? `${path}?${qs}` : path;
}

export type CompanyRef = { id: string; name: string };

export type CompanyListRow = {
  id: string;
  name: string;
  kind: CompanyKind;
  city: string | null;
  plate_code: string | null;
  segment: string | null;
  logo_code: string | null;
  phone: string | null;
  buys_from_company_id: string | null;
  buysFromName: string | null;
  created_by: string | null;
  created_at: string;
  reps: CompanyReps | null;
  lastVisit: string | null;
};

type RawRow = Omit<CompanyListRow, "buysFromName" | "reps" | "lastVisit"> & {
  buys_from: { name: string } | { name: string }[] | null;
};

const collator = new Intl.Collator("tr");

/** Full list rows (filters + enrichment + ordering) for a list page. */
export async function listCompanies(
  client: SupabaseClient,
  p: CompanyListParams,
  limit: number
): Promise<CompanyListRow[]> {
  let query = client
    .from("companies")
    .select(
      "id, name, kind, city, plate_code, segment, logo_code, phone, buys_from_company_id, created_by, created_at, buys_from:buys_from_company_id(name)"
    )
    .is("deleted_at", null)
    .order("name")
    .limit(limit);
  const kind = parseKind(p.tur);
  if (kind) query = query.eq("kind", kind);
  const q = (p.q ?? "").trim();
  if (q) query = query.ilike("name", `%${q}%`);
  const bolge = (p.bolge ?? "").trim();
  if (/^\d{2}$/.test(bolge)) query = query.eq("plate_code", bolge);
  else if (bolge) query = query.ilike("city", bolge);
  const seg = parseSegment(p.segment);
  if (seg) query = query.eq("segment", seg);

  const { data } = await query;
  const raw = (data as unknown as RawRow[] | null) ?? [];
  if (raw.length === 0) return [];
  const ids = raw.map((r) => r.id);

  const [{ data: assignments }, lastRows] = await Promise.all([
    client.from("assignments").select("company_id, salesperson_id, role"),
    (async () => {
      const out: { company_id: string; last_visit_date: string | null }[] = [];
      for (let i = 0; i < ids.length; i += 300) {
        const { data: lv } = await client
          .from("company_last_visit")
          .select("company_id, last_visit_date")
          .in("company_id", ids.slice(i, i + 300));
        out.push(...((lv as { company_id: string; last_visit_date: string | null }[] | null) ?? []));
      }
      return out;
    })(),
  ]);
  const assignMap = groupAssignments(assignments);
  const lastMap = new Map(lastRows.map((r) => [r.company_id, r.last_visit_date]));

  let rows: CompanyListRow[] = raw.map((r) => {
    const { buys_from, ...rest } = r;
    const bf = Array.isArray(buys_from) ? buys_from[0] : buys_from;
    return {
      ...rest,
      buysFromName: bf?.name ?? null,
      reps: assignMap.get(r.id) ?? null,
      lastVisit: lastMap.get(r.id) ?? null,
    };
  });

  if (p.sp) rows = rows.filter((r) => r.reps?.owner === p.sp || (r.reps?.backups.includes(p.sp!) ?? false));
  if (p.atama === "yok") rows = rows.filter((r) => !r.reps || (!r.reps.owner && r.reps.backups.length === 0));
  const age = parseVisitAge(p.ziyaret);
  if (age === "yok") rows = rows.filter((r) => !r.lastVisit);
  else if (age) {
    const min = Number(age);
    rows = rows.filter((r) => {
      const d = daysSince(r.lastVisit);
      return d == null || d >= min;
    });
  }

  const sort = parseSort(p.sirala);
  if (sort === "ziyaret") {
    // Never visited first, then the longest-unvisited.
    rows.sort((a, b) => {
      if (!a.lastVisit && !b.lastVisit) return collator.compare(a.name, b.name);
      if (!a.lastVisit) return -1;
      if (!b.lastVisit) return 1;
      return a.lastVisit.localeCompare(b.lastVisit) || collator.compare(a.name, b.name);
    });
  } else if (sort === "sehir") {
    const key = (r: CompanyListRow) => `${r.plate_code ?? "99"} ${r.city ?? "zzz"}`;
    rows.sort((a, b) => collator.compare(key(a), key(b)) || collator.compare(a.name, b.name));
  } else {
    rows.sort((a, b) => collator.compare(a.name, b.name));
  }
  return rows;
}

/** Ids + names in list order (same filters / ordering as the list pages). */
export async function listCompanyRefs(
  client: SupabaseClient,
  p: CompanyListParams,
  limit: number
): Promise<CompanyRef[]> {
  return (await listCompanies(client, p, limit)).map(({ id, name }) => ({ id, name }));
}

export type CompanyNeighbours = {
  prev: CompanyRef | null;
  next: CompanyRef | null;
  index: number;
  total: number;
};

/** Previous / next company around `currentId` in list order (null when not in the list). */
export async function companyNeighbours(
  client: SupabaseClient,
  p: CompanyListParams,
  currentId: string,
  limit: number
): Promise<CompanyNeighbours | null> {
  const rows = await listCompanyRefs(client, p, limit);
  const i = rows.findIndex((r) => r.id === currentId);
  if (i < 0) return null;
  return { prev: rows[i - 1] ?? null, next: rows[i + 1] ?? null, index: i + 1, total: rows.length };
}
