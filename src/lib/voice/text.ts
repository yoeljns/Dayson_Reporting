/**
 * Turkish text helpers for the voice parser: diacritic-insensitive
 * normalisation, tokenising, trigram similarity and number words.
 * Pure functions — usable on the client and the server.
 */
const MAP: Record<string, string> = {
  ş: "s", Ş: "s", ı: "i", I: "i", İ: "i", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c", â: "a", î: "i", û: "u",
};

/** Lowercase, ASCII-fold Turkish letters, strip punctuation, collapse spaces. */
export function norm(s: string): string {
  return String(s ?? "")
    .replace(/[şŞıIİğĞüÜöÖçÇâîû]/g, (ch) => MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const tokens = (s: string): string[] => (norm(s) ? norm(s).split(" ") : []);

function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/** Dice coefficient over character trigrams of two normalized strings (0..1). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

/** Cheap Turkish stem: drop common suffixes so "mastikte" ≈ "mastik", "sistayı" ≈ "sista". */
export function stem(w: string): string {
  let x = w;
  // Verb endings first ("gonderecegim" → "gonder", "arayacagim" → "ara").
  x = x.replace(/(ecegim|acagim|ecegiz|acagiz|eceksin|acaksin|ecek|acak|iyorum|iyoruz|iyorlar|iyor|uyor|uyorum|dim|dik|tim|tik|dum|duk|tum|tuk|dim|mis|mus|misler|muslar|erim|arim|iriz|ariz|elim|alim|eyim|ayim)$/, "");
  if (x.length < 3) x = w;
  for (let i = 0; i < 3; i++) {
    const before = x;
    x = x.replace(/(lar|ler|lari|leri|dan|den|tan|ten|nin|nun|nin|nun|in|un|de|da|te|ta|ya|ye|yi|yu|yi|le|la|ki|nda|nde|ndan|nden|yla|yle|si|su|i|u|a|e)$/, "");
    if (x.length < 3 || x === before) return before.length >= 3 ? before : w;
  }
  return x.length >= 3 ? x : w;
}

const UNITS: Record<string, number> = {
  sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
};
const TENS: Record<string, number> = { on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90 };
const MULT: Record<string, number> = { yuz: 100, bin: 1000 };

/**
 * Parse a number starting at token index `i` (digits or Turkish number words,
 * "buçuk" / "yarım" supported). Returns null when no number starts there.
 */
export function readNumber(toks: string[], i: number): { value: number; next: number } | null {
  let j = i;
  let total = 0;
  let current = 0;
  let any = false;
  // digits
  const d = toks[j];
  if (d && /^\d+([.,]\d+)?$/.test(d)) {
    let v = Number(d.replace(",", "."));
    j++;
    if (toks[j] === "bucuk") {
      v += 0.5;
      j++;
    }
    return { value: v, next: j };
  }
  if (toks[j] === "yarim") return { value: 0.5, next: j + 1 };
  while (j < toks.length) {
    const w = toks[j];
    if (w in UNITS) {
      current += UNITS[w];
      any = true;
      j++;
    } else if (w in TENS) {
      current += TENS[w];
      any = true;
      j++;
    } else if (w in MULT) {
      const m = MULT[w];
      if (m === 100) current = (current || 1) * 100;
      else {
        total += (current || 1) * m;
        current = 0;
      }
      any = true;
      j++;
    } else if (w === "bucuk" && any) {
      total += current + 0.5;
      current = 0;
      j++;
      return { value: total, next: j };
    } else break;
  }
  if (!any) return null;
  return { value: total + current, next: j };
}

export type LabelHit = { start: number; end: number; score: number };

/** Every non-overlapping fuzzy hit of `label` inside `toks` (windows of the label's length ±1). */
export function findLabelAll(toks: string[], label: string, minScore: number): LabelHit[] {
  const lab = norm(label);
  const lt = lab.split(" ").filter(Boolean);
  if (lt.length === 0) return [];
  const labStem = lt.map(stem).join(" ");
  const cands: LabelHit[] = [];
  const sizes = Array.from(new Set([lt.length, Math.max(1, lt.length - 1), lt.length + 1]));
  for (const size of sizes) {
    for (let i = 0; i + size <= toks.length; i++) {
      const win = toks.slice(i, i + size);
      let score = similarity(win.map(stem).join(" "), labStem);
      // Short labels must match a token almost exactly.
      if (lab.length < 4 && win.join(" ") !== lab) score = 0;
      if (score >= minScore) cands.push({ start: i, end: i + size, score });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.start - b.start);
  const out: LabelHit[] = [];
  for (const c of cands) {
    if (out.some((o) => c.start < o.end && o.start < c.end)) continue;
    out.push(c);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Best fuzzy hit of `label` inside `toks` (highest score, earliest on ties). */
export function findLabel(toks: string[], label: string, minScore: number): LabelHit | null {
  const all = findLabelAll(toks, label, minScore);
  if (all.length === 0) return null;
  return all.reduce((b, h) => (h.score > b.score ? h : b), all[0]);
}

/** Share of a label's (stemmed) tokens that appear in `ctx` — loose bag-of-words match for long SKU names. */
export function tokenOverlap(ctx: string[], key: string): { matched: number; total: number } {
  const kt = Array.from(new Set(norm(key).split(" ").filter(Boolean).map(stem)));
  const cs = new Set(ctx.map(stem));
  let matched = 0;
  for (const k of kt) if (cs.has(k)) matched++;
  return { matched, total: kt.length };
}
