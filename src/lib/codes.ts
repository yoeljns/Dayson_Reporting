/**
 * Human-readable record codes derived from the uuid — never stored, always
 * recomputed. "ZY-3F9A" for visits, "S-1A2B" for complaints, "SS-…" for stock
 * counts.
 */
export function shortCode(prefix: string, id: string): string {
  const hex = id.replace(/-/g, "");
  return `${prefix}-${hex.slice(-4).toUpperCase()}`;
}

export const visitCode = (id: string) => shortCode("ZY", id);
export const complaintCode = (id: string) => shortCode("S", id);
export const stockCountCode = (id: string) => shortCode("SS", id);
