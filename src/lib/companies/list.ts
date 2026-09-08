import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANY_KINDS, type CompanyKind } from "@/lib/enums";

/**
 * Shared company-list ordering used by the rep list (/firmalar), the office
 * list (/admin/firmalar) and the Önceki / Sıradaki navigation on detail pages,
 * so "next" always means "next row of the list you came from".
 */
export type CompanyListParams = { q?: string | null; tur?: string | null; atama?: string | null };

export function parseKind(v?: string | null): CompanyKind | null {
  return (COMPANY_KINDS as readonly string[]).includes(v ?? "") ? (v as CompanyKind) : null;
}

/** "q=…&tur=…&atama=yok" (no leading "?"), empty when nothing is set. */
export function listQueryString(p: CompanyListParams): string {
  const sp = new URLSearchParams();
  const q = (p.q ?? "").trim();
  if (q) sp.set("q", q);
  const k = parseKind(p.tur);
  if (k) sp.set("tur", k);
  if (p.atama === "yok") sp.set("atama", "yok");
  return sp.toString();
}

/** Join a path with query fragments, skipping empty ones. */
export function withQuery(path: string, ...parts: (string | null | undefined)[]): string {
  const qs = parts.filter((s) => s && s.length > 0).join("&");
  return qs ? `${path}?${qs}` : path;
}

export type CompanyRef = { id: string; name: string };

/** Ids + names in list order (same filters / ordering as the list pages). */
export async function listCompanyRefs(
  client: SupabaseClient,
  p: CompanyListParams,
  limit: number
): Promise<CompanyRef[]> {
  let query = client
    .from("companies")
    .select("id, name")
    .is("deleted_at", null)
    .order("name")
    .limit(limit);
  const kind = parseKind(p.tur);
  if (kind) query = query.eq("kind", kind);
  const q = (p.q ?? "").trim();
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  let rows = (data as CompanyRef[] | null) ?? [];
  if (p.atama === "yok" && rows.length > 0) {
    const { data: as } = await client.from("assignments").select("company_id");
    const assigned = new Set(((as as { company_id: string }[] | null) ?? []).map((a) => a.company_id));
    rows = rows.filter((r) => !assigned.has(r.id));
  }
  return rows;
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
