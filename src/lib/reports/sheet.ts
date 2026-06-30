import * as XLSX from "xlsx";

/**
 * Workbook/worksheet primitives for report export. Kept separate so `xlsx` is
 * only pulled into the export route (Node), never the page bundle.
 */

export type Cell = string | number | null;
export type SheetRow = Record<string, Cell>;

/** Excel sheet-name rules: ≤31 chars, no : \ / ? * [ ] */
export function safeName(s: string): string {
  const cleaned = s.replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || "Sayfa").slice(0, 31);
}

/**
 * Build a worksheet from label-keyed rows. `headers` fixes column order and
 * guarantees a header row even when there are no rows (download never errors).
 */
export function rowsToSheet(rows: SheetRow[], headers: string[]): XLSX.WorkSheet {
  const ws =
    rows.length > 0
      ? XLSX.utils.json_to_sheet(rows, { header: headers })
      : XLSX.utils.aoa_to_sheet([headers]);
  ws["!cols"] = headers.map((h) => ({
    wch: Math.min(
      60,
      Math.max(h.length + 2, 8, ...rows.map((r) => String(r[h] ?? "").length + 2))
    ),
  }));
  return ws;
}

export function newWorkbook(): XLSX.WorkBook {
  return XLSX.utils.book_new();
}

export function appendSheet(
  wb: XLSX.WorkBook,
  name: string,
  rows: SheetRow[],
  headers: string[]
): void {
  XLSX.utils.book_append_sheet(wb, rowsToSheet(rows, headers), safeName(name));
}

export function workbookBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
