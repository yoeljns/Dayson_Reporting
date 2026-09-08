import * as XLSX from "xlsx";

/**
 * Parser for the Logo "Hareket Özel Koduna Göre Malzeme Ekstresi" export
 * (TOPLU.xlsx). Layout per material section:
 *   "Malzeme (Sınıfı) Türü" | … | "Kodu" | <code> | "Açıklaması" | <desc> | … | "Birim" | KOLİ
 *   "Fiş Tarihi" header row, then movement rows with column A empty:
 *   B date (Excel serial), D fiş no, G customer, N out quantity (koli),
 *   R "İşlem Döviz Tutarı" (EUR); "Toplam :" rows close a section.
 */
export type ShipmentRow = {
  fisNo: string;
  fisDate: string; // YYYY-MM-DD
  cariName: string;
  productCode: string;
  productDesc: string;
  koli: number;
  eur: number;
};

export type ParsedEkstre = {
  rows: ShipmentRow[];
  products: { code: string; desc: string }[];
  minDate: string | null;
  maxDate: string | null;
  /** Movement rows without an out quantity (returns / zero lines). */
  skipped: number;
};

type Cell = string | number | boolean | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, "0");

function cellDate(v: Cell): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    // Excel serial (1900 date system): day 25569 = 1970-01-01.
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    const iso = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

const text = (v: Cell) => (v == null ? "" : String(v).trim());
const num = (v: Cell) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

export function parseMalzemeEkstresi(buf: Buffer | ArrayBuffer | Uint8Array): ParsedEkstre {
  const wb = XLSX.read(buf, { type: buf instanceof ArrayBuffer ? "array" : "buffer", cellDates: false });
  const rows: ShipmentRow[] = [];
  const products: { code: string; desc: string }[] = [];
  let skipped = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null });
    let current: { code: string; desc: string } | null = null;
    for (const r of grid) {
      const a = text(r[0]);
      if (a && /Malzeme/i.test(a) && /T[üu]r/i.test(a)) {
        current = { code: text(r[3]), desc: text(r[5]) };
        if (current.code) products.push(current);
        continue;
      }
      if (a) continue; // header / "Toplam :" / report meta rows
      if (!current || !current.code) continue;
      const fisNo = text(r[3]);
      const cari = text(r[6]);
      const date = cellDate(r[1]);
      if (!fisNo || !cari || !date) continue;
      const koli = num(r[13]);
      if (koli <= 0) {
        skipped++;
        continue;
      }
      const eur = num(r[17]);
      rows.push({
        fisNo,
        fisDate: date,
        cariName: cari,
        productCode: current.code,
        productDesc: current.desc,
        koli,
        eur,
      });
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }
  }
  return { rows, products, minDate, maxDate, skipped };
}
