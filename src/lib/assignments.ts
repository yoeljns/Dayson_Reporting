import type { AssignmentRole } from "@/lib/enums";

export type AssignmentRow = {
  company_id: string;
  salesperson_id: string;
  role?: AssignmentRole | string | null;
};

export type CompanyReps = { owner: string | null; backups: string[] };

/**
 * Group assignment rows per company into one owner (Sorumlu) + backups
 * (Yedek). Rows without a role column (older selects) count as owners; when
 * several owners exist the first wins and the rest become backups.
 */
export function groupAssignments(
  rows: AssignmentRow[] | null | undefined
): Map<string, CompanyReps> {
  const map = new Map<string, CompanyReps>();
  for (const a of rows ?? []) {
    if (!a.company_id || !a.salesperson_id) continue;
    const g = map.get(a.company_id) ?? { owner: null, backups: [] };
    const role = a.role ?? "owner";
    if (role === "owner" && !g.owner) g.owner = a.salesperson_id;
    else if (!g.backups.includes(a.salesperson_id)) g.backups.push(a.salesperson_id);
    map.set(a.company_id, g);
  }
  return map;
}

/** All salesperson ids of a company, owner first. */
export function repIds(g: CompanyReps | undefined): string[] {
  if (!g) return [];
  return [...(g.owner ? [g.owner] : []), ...g.backups];
}

/** "Ayşe Yılmaz" / "Ayşe Yılmaz +1" / "Atanmamış" for compact lists. */
export function repsLabel(
  g: CompanyReps | undefined,
  nameOf: (id: string) => string | undefined,
  unassigned = "Atanmamış"
): string {
  const ids = repIds(g);
  if (ids.length === 0) return unassigned;
  const first = nameOf(ids[0]) ?? "—";
  return ids.length > 1 ? `${first} +${ids.length - 1}` : first;
}

/** Full names joined with roles, for detail pages. */
export function repsDetail(
  g: CompanyReps | undefined,
  nameOf: (id: string) => string | undefined
): { id: string; name: string; role: AssignmentRole }[] {
  if (!g) return [];
  const out: { id: string; name: string; role: AssignmentRole }[] = [];
  if (g.owner) out.push({ id: g.owner, name: nameOf(g.owner) ?? "—", role: "owner" });
  for (const b of g.backups)
    out.push({ id: b, name: nameOf(b) ?? "—", role: "backup" });
  return out;
}
