/**
 * Product code → sales category + unit conversion. Ported from the office's
 * "Toplu Çıkışlar — Koli → Palet" converter so the app reports the same
 * numbers: mastik / sosis / bant in pallets (koli ÷ rate), sandpaper in pieces
 * (koli × koli içi), the rest in boxes. Kalibre, kızak and pad lines are
 * excluded from targets altogether.
 */
export type SalesUnit = "palet" | "adet" | "koli";

export type PalletRates = { extMastik: number; tixo: number; sosis: number; bant: number };
export type RateKey = keyof PalletRates;
export const DEFAULT_PALLET_RATES: PalletRates = { extMastik: 64, tixo: 72, sosis: 65, bant: 84 };
export const RATE_LABELS: Record<RateKey, string> = {
  extMastik: "Extra mastik (koli/palet)",
  tixo: "Tixo mastik (koli/palet)",
  sosis: "Sosis (koli/palet)",
  bant: "Bant — tüm bantlar (koli/palet)",
};

/** Category codes = `sales_categories.code`. */
export type SalesCategoryCode =
  | "mastik" | "sosis" | "byz_kls" | "byz_ext" | "kah_ext" | "sari35" | "uni" | "sari30" | "kah30"
  | "putur" | "sia_su" | "sia_kuru" | "day_kuru" | "sia_cirt" | "day_cirt" | "soft" | "kece"
  | "zim_mak" | "tabanca";

/** Categories reported as pieces (koli × koli içi). Everything with a rate is pallets; the rest boxes. */
const ADET_CATEGORIES = new Set<SalesCategoryCode>(["sia_su", "sia_kuru", "sia_cirt", "day_cirt", "kece", "zim_mak"]);

type Rule = {
  test: (code: string, desc: string) => boolean;
  /** null = excluded from targets (kalibre, kızak, pad). */
  category: SalesCategoryCode | null;
  rateKey: RateKey | null;
};

// Order matters: more specific patterns first (same order as the converter).
const MAPPING_RULES: Rule[] = [
  { test: (c) => /^DTAB/i.test(c), category: "tabanca", rateKey: null },
  { test: (c) => /^DMAK/i.test(c), category: "zim_mak", rateKey: null },
  { test: (c) => /^ZKIZAK/i.test(c) || /^ZK/i.test(c) || /^ZPAD/i.test(c), category: null, rateKey: null },
  { test: (c, d) => /^SOS/i.test(c) || /SOSIS/i.test(c) || /SOSİS/i.test(d), category: "sosis", rateKey: "sosis" },
  {
    test: (c, d) => /^OMD/i.test(c) && (/TİXO/i.test(c) || /TIXO/i.test(c) || /TİXO/i.test(d) || /TIXO/i.test(d)),
    category: "mastik",
    rateKey: "tixo",
  },
  { test: (c) => /^OMD/i.test(c), category: "mastik", rateKey: "extMastik" },
  { test: (c) => /^MBDBEYEXT/i.test(c), category: "byz_ext", rateKey: "bant" },
  { test: (c) => /^MBDBEYKLS/i.test(c), category: "byz_kls", rateKey: "bant" },
  { test: (c) => /^MBDBEYUN[Iİ]/i.test(c), category: "uni", rateKey: "bant" },
  { test: (c) => /^MBDKAHEXT/i.test(c), category: "kah_ext", rateKey: "bant" },
  { test: (c) => /^MBDKAHKLS/i.test(c), category: "kah30", rateKey: "bant" },
  { test: (c) => /^MBDSARIKLS/i.test(c), category: "sari35", rateKey: "bant" },
  { test: (c) => /^MBDSARIUN[Iİ]/i.test(c), category: "sari30", rateKey: "bant" },
  { test: (c) => /^MBD/i.test(c), category: "uni", rateKey: "bant" },
  { test: (c, d) => /^P[UÜ]T[UÜ]R/i.test(c) || /P[UÜ]T[UÜ]R/i.test(d), category: "putur", rateKey: null },
  { test: (c) => /^ZP1913/i.test(c), category: "sia_su", rateKey: null },
  { test: (c) => /^ZP1949/i.test(c), category: "sia_kuru", rateKey: null },
  { test: (c) => /^ZC1949/i.test(c), category: "sia_cirt", rateKey: null },
  { test: (c) => /^ZCDS/i.test(c) || /^HDAYCIRT/i.test(c), category: "day_cirt", rateKey: null },
  { test: (c) => /^ZDAYSONKURU/i.test(c), category: "day_kuru", rateKey: null },
  { test: (c, d) => /^ZSOFT/i.test(c) || /\bSOFT\b/i.test(d), category: "soft", rateKey: null },
  { test: (c, d) => /KE[CÇ]E/i.test(c) || /KE[CÇ]E/i.test(d), category: "kece", rateKey: null },
];

/** Grit number embedded in a sandpaper code (ZP19130060 → 60, ZC1949150/7040 → 40). */
export function extractGrit(code: string): number | null {
  let m = code.match(/^ZP(?:1913|1949)(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  m = code.match(/^ZDAYSONKURU(\d+)$/i);
  if (m) return parseInt(m[1], 10);
  m = code.match(/(\d{3})$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Pieces per box (source: "STOK KODLARI VE KOLİ İÇLERİ.xlsx"). */
export function koliIci(code: string): number {
  if (/^ZC1949/i.test(code)) {
    const g = extractGrit(code);
    return g != null && g <= 60 ? 500 : 600;
  }
  if (/^ZCDS/i.test(code)) {
    const g = extractGrit(code);
    return g != null && g <= 60 ? 250 : 500;
  }
  if (/^ZP1913/i.test(code)) {
    const g = extractGrit(code);
    return g != null && g <= 150 ? 250 : 500;
  }
  if (/^ZP1949/i.test(code)) {
    const g = extractGrit(code);
    return g != null && g <= 100 ? 250 : 500;
  }
  if (/^ZK/i.test(code)) return 4;
  if (/KE[CÇ]E/i.test(code)) return 30;
  if (/P[UÜ]T[UÜ]R/i.test(code)) return 12;
  if (/^DMAK/i.test(code)) return 6;
  if (/^OMD/i.test(code)) return 25;
  if (/^SOS/i.test(code)) return 20;
  if (/^MBD/i.test(code)) {
    const mm = code.match(/X(\d+)$/i);
    if (mm) {
      const w = parseInt(mm[1], 10);
      if (w <= 12) return 144;
      if (w <= 15) return 120;
      if (w <= 18) return 96;
      if (w <= 24) return 72;
      if (w <= 36) return 48;
      return 36;
    }
    return 72;
  }
  return 1;
}

export type Classification =
  | { kind: "mapped"; category: SalesCategoryCode; unit: SalesUnit; rateKey: RateKey | null; qtyPerKoli: number }
  | { kind: "excluded" }
  | { kind: "unmapped" };

/** Map one product line to its sales category and the koli → unit multiplier. */
export function classify(code: string, desc: string, rates: PalletRates = DEFAULT_PALLET_RATES): Classification {
  const c = (code ?? "").trim();
  const d = (desc ?? "").trim();
  for (const rule of MAPPING_RULES) {
    if (!rule.test(c, d)) continue;
    if (!rule.category) return { kind: "excluded" };
    if (rule.rateKey) {
      const rate = Number(rates[rule.rateKey]) || DEFAULT_PALLET_RATES[rule.rateKey];
      return { kind: "mapped", category: rule.category, unit: "palet", rateKey: rule.rateKey, qtyPerKoli: 1 / rate };
    }
    if (ADET_CATEGORIES.has(rule.category))
      return { kind: "mapped", category: rule.category, unit: "adet", rateKey: null, qtyPerKoli: koliIci(c) };
    return { kind: "mapped", category: rule.category, unit: "koli", rateKey: null, qtyPerKoli: 1 };
  }
  return { kind: "unmapped" };
}

/** Sanitise rates coming from settings / a form; falls back per key. */
export function normalizeRates(v: unknown): PalletRates {
  const src = (v && typeof v === "object" ? v : {}) as Partial<Record<RateKey, unknown>>;
  const out = { ...DEFAULT_PALLET_RATES };
  for (const k of Object.keys(out) as RateKey[]) {
    const n = Number(src[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

/**
 * Customer-name key used to auto-match ERP names to companies: first two
 * words, each cut at the first punctuation ("HTK ENDS.ÜRÜN…" → "htk ends").
 */
export function nameKey(name: string): string {
  const words = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^[-.,;:]+$/.test(w));
  const toks: string[] = [];
  for (const w of words) {
    const cut = w.split(/[.,;:]/)[0];
    const t = (cut.length >= 2 ? cut : w).replace(/[-.,;:]+$/g, "");
    if (t) toks.push(t);
    if (toks.length === 2) break;
  }
  return toks.join(" ").toLocaleLowerCase("tr");
}
