import { findLabel, findLabelAll, norm, readNumber, similarity, stem, tokenOverlap, tokens } from "@/lib/voice/text";

/**
 * Rule-based Turkish transcript → form draft. No AI: dictionaries come from
 * the database (brands, competitors, SKUs, question options, aliases) and are
 * matched fuzzily; numbers, prices, dates and a handful of intent phrases are
 * recognised by pattern. Everything that is not understood stays in the note,
 * so nothing the rep said is lost.
 */
/** `key` = the text to match on when it differs from the display label (long SKU names). */
export type DictEntry = { id: string; label: string; key?: string };
export type AliasKind = "brand" | "competitor" | "competitor_product" | "category" | "sku" | "option";
export type VoiceAlias = { heard: string; kind: AliasKind; targetId: string };

export type VoiceQuestion = {
  id: string;
  code: string;
  label: string;
  input_type: string;
  options: { value: string; label: string }[];
};

export type VoiceDictionary = {
  brands: DictEntry[];
  /** Raf Bilgisi categories with the brand ids offered in each. */
  categories: { id: string; label: string; brandIds: string[] }[];
  competitors: DictEntry[];
  competitorProducts: { id: string; competitorId: string; label: string }[];
  skus: DictEntry[];
  questions: VoiceQuestion[];
  contacts: DictEntry[];
  contactRoles: { value: string; label: string }[];
  aliases: VoiceAlias[];
};

export type DraftCompetitor = {
  competitorId: string | null;
  competitorName: string;
  productId: string | null;
  productName: string;
  price: number | null;
  vat: boolean | null;
  heard: string;
};

export type VoiceDraft = {
  answers: Record<string, string>;
  details: Record<string, string>;
  products: { categoryId: string; brandIds: string[]; supply: "" | "own_production" | "export" }[];
  contactId: string | null;
  contactName: string | null;
  contactRole: string | null;
  competitors: DraftCompetitor[];
  complaints: { description: string }[];
  stock: { skuId: string; label: string; pallets: number }[];
  note: string;
  /** Human-readable summary lines of what was filled (for the review / readback). */
  filled: string[];
  /** Brand-like words nobody recognised. */
  unmatched: string[];
};

const KEYWORDS = ["rakip", "sikayet", "stok", "raf", "siparis", "memnun", "sonraki", "gorus", "tekrar", "not"];

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function segmentAfter(toks: string[], start: number, max = 24): string[] {
  const out: string[] = [];
  for (let i = start; i < toks.length && out.length < max; i++) {
    const w = toks[i];
    if (i > start && KEYWORDS.some((k) => w.startsWith(k))) break;
    out.push(w);
  }
  return out;
}

/** Alias lookup: exact normalized phrase inside the transcript. */
function aliasHits(toks: string[], aliases: VoiceAlias[], kind: AliasKind): { id: string; start: number; end: number }[] {
  const joined = ` ${toks.join(" ")} `;
  const out: { id: string; start: number; end: number }[] = [];
  for (const a of aliases) {
    if (a.kind !== kind) continue;
    const heard = norm(a.heard);
    if (!heard) continue;
    const idx = joined.indexOf(` ${heard} `);
    if (idx < 0) continue;
    const start = joined.slice(0, idx + 1).split(" ").length - 1;
    out.push({ id: a.targetId, start, end: start + heard.split(" ").length });
  }
  return out;
}

function matchEntries(
  toks: string[],
  entries: DictEntry[],
  minScore: number,
  aliases: VoiceAlias[],
  kind: AliasKind
): { id: string; label: string; start: number; end: number; score: number }[] {
  const hits: { id: string; label: string; start: number; end: number; score: number }[] = [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const a of aliasHits(toks, aliases, kind)) {
    const e = byId.get(a.id);
    if (e) hits.push({ id: e.id, label: e.label, start: a.start, end: a.end, score: 1 });
  }
  for (const e of entries) {
    for (const h of findLabelAll(toks, e.key ?? e.label, minScore)) {
      if (!hits.some((x) => x.id === e.id && x.start === h.start)) hits.push({ id: e.id, label: e.label, ...h });
    }
  }
  // Resolve overlaps: keep the higher score per token span.
  hits.sort((a, b) => b.score - a.score);
  const taken: boolean[] = Array(toks.length).fill(false);
  const out: typeof hits = [];
  for (const h of hits) {
    let free = true;
    for (let i = h.start; i < h.end; i++) if (taken[i]) free = false;
    if (!free) continue;
    for (let i = h.start; i < h.end; i++) taken[i] = true;
    out.push(h);
  }
  return out.sort((a, b) => a.start - b.start);
}

function readPrice(seg: string[]): { price: number | null; vat: boolean | null } {
  let price: number | null = null;
  let vat: boolean | null = null;
  for (let i = 0; i < seg.length; i++) {
    const n = readNumber(seg, i);
    if (n && price == null) {
      const unit = seg[n.next] ?? "";
      const before = seg[i - 1] ?? "";
      if (/^(euro|avro|lira|tl|liradan|eurodan|liraya|euroya)$/.test(unit) || /^(fiyat|fiyati)$/.test(before)) price = n.value;
    }
  }
  const j = seg.join(" ");
  if (/kdv dahil|kdvli|kdv li|kdv ile/.test(j)) vat = true;
  else if (/kdv haric|kdvsiz|arti kdv|kdv siz/.test(j)) vat = false;
  return { price, vat };
}

/** Option match for a select question: alias, then synonyms, then label similarity. */
const OPTION_SYNONYMS: Record<string, Record<string, string[]>> = {
  siparis_alinmama_nedeni: {
    fiyat: ["pahali", "fiyat", "fiyattan", "ucuz degil"],
    stok_yok: ["stok yok", "stogu var", "stoklu", "dolu", "stok dolu", "stoku var"],
    ihtiyac_yok: ["ihtiyac yok", "ihtiyaci yok", "gerek yok", "lazim degil"],
    rakip_tercih: ["rakip", "baska marka", "rakibi tercih", "rakipten aliyor"],
  },
  sonraki_aksiyon: {
    ara: ["arayacagim", "arayalim", "telefon acacagim", "telefonla ara", "ariyacagim", "arayip"],
    numune_gonder: ["numune"],
    teklif_gonder: ["teklif"],
    ziyaret_planla: ["tekrar gelecegim", "yeniden gelecegim", "tekrar ugrayacagim", "yine gelecegim"],
  },
  genel_memnuniyet: {},
};

function matchOption(q: VoiceQuestion, toks: string[], aliases: VoiceAlias[]): { value: string; label: string } | null {
  for (const a of aliases) {
    if (a.kind !== "option") continue;
    const opt = q.options.find((o) => o.value === a.targetId);
    if (opt && aliasHits(toks, [a], "option").length) return opt;
  }
  const syn = OPTION_SYNONYMS[q.code];
  if (syn) {
    const joined = ` ${toks.join(" ")} `;
    for (const [value, phrases] of Object.entries(syn)) {
      if (phrases.some((p) => joined.includes(` ${norm(p)} `))) {
        const opt = q.options.find((o) => o.value === value);
        if (opt) return opt;
      }
    }
  }
  let best: { value: string; label: string; score: number } | null = null;
  for (const o of q.options) {
    if (o.value === "diger") continue;
    const h = findLabel(toks, o.label, 0.74);
    if (h && (!best || h.score > best.score)) best = { ...o, score: h.score };
  }
  return best ? { value: best.value, label: best.label } : null;
}

export function parseTranscript(text: string, dict: VoiceDictionary, opts: { today: string }): VoiceDraft {
  const raw = String(text ?? "").trim();
  const toks = tokens(raw);
  const joined = ` ${toks.join(" ")} `;
  const draft: VoiceDraft = {
    answers: {},
    details: {},
    products: [],
    contactId: null,
    contactName: null,
    contactRole: null,
    competitors: [],
    complaints: [],
    stock: [],
    note: raw,
    filled: [],
    unmatched: [],
  };
  if (toks.length === 0) return draft;
  const qByCode = new Map(dict.questions.map((q) => [q.code, q]));

  // --- Order taken / not taken ---------------------------------------------
  const orderQ = qByCode.get("siparis_alindi");
  if (orderQ) {
    if (/ siparis (alamadim|alamadik|almadim|yok|cikmadi|olmadi|vermedi|vermedi) | siparis vermedi /.test(joined)) {
      draft.answers[orderQ.id] = "hayir";
      draft.filled.push("Sipariş: alınmadı");
    } else if (/ siparis (aldim|aldik|verdi|var|cikti|alindi) /.test(joined)) {
      draft.answers[orderQ.id] = "evet";
      draft.filled.push("Sipariş: alındı");
    }
  }

  // --- Select questions: option labels / synonyms --------------------------
  for (const q of dict.questions) {
    if (q.input_type !== "select" && q.input_type !== "multiselect") continue;
    if (q.code === "gorusulen_kisi_rolu") continue;
    if (q.code === "siparis_alinmama_nedeni" && draft.answers[orderQ?.id ?? ""] !== "hayir") continue;
    const m = matchOption(q, toks, dict.aliases);
    if (m) {
      draft.answers[q.id] = m.value;
      draft.filled.push(`${q.label}: ${m.label}`);
    }
  }
  // Satisfaction wording that has no option label to match.
  const memQ = qByCode.get("genel_memnuniyet");
  const joinedStem = ` ${toks.map(stem).join(" ")} `;
  if (memQ && !draft.answers[memQ.id]) {
    const pick = (re: RegExp, pred: (label: string) => boolean) => {
      if (!re.test(joined) && !re.test(joinedStem)) return;
      const o = memQ.options.find((x) => pred(norm(x.label)));
      if (o) {
        draft.answers[memQ.id] = o.value;
        draft.filled.push(`${memQ.label}: ${o.label}`);
      }
    };
    pick(/ (cok memnun|super|harika|cok iyi) /, (l) => l.includes("cok memnun") || l.startsWith("5"));
    if (!draft.answers[memQ.id]) pick(/ (memnun degil|sikayetci|mutsuz|kizgin|kotu) /, (l) => l.includes("memnun degil") || l.startsWith("1") || l.startsWith("2"));
    if (!draft.answers[memQ.id]) pick(/ memnun /, (l) => l === "memnun" || l.includes("memnun") && !l.includes("degil") && !l.includes("cok"));
  }

  // --- Next visit date ------------------------------------------------------
  const dateQ = qByCode.get("sonraki_ziyaret_tarihi");
  if (dateQ) {
    let date: string | null = null;
    if (/ (haftaya|gelecek hafta|bir hafta sonra|onumuzdeki hafta) /.test(joined)) date = addDays(opts.today, 7);
    else if (/ iki hafta sonra /.test(joined)) date = addDays(opts.today, 14);
    else if (/ (uc hafta sonra) /.test(joined)) date = addDays(opts.today, 21);
    else if (/ (bir ay sonra|gelecek ay|onumuzdeki ay) /.test(joined)) date = addDays(opts.today, 30);
    else if (/ yarin /.test(joined)) date = addDays(opts.today, 1);
    else {
      const m = joined.match(/ (\d+|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz|on|on bes) gun sonra /);
      if (m) {
        const n = readNumber(m[1].split(" "), 0);
        if (n) date = addDays(opts.today, Math.round(n.value));
      }
    }
    if (date) {
      draft.answers[dateQ.id] = date;
      draft.filled.push(`${dateQ.label}: ${date}`);
    }
  }

  // --- Contact ---------------------------------------------------------------
  const nameMatch = raw.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)?)\s+(Bey|Hanım|Hanim|bey|hanım|hanim)/);
  if (nameMatch) {
    const name = nameMatch[1];
    let best: { id: string; label: string; score: number } | null = null;
    for (const c of dict.contacts) {
      const s = similarity(norm(c.label.split(" ")[0]), norm(name.split(" ")[0]));
      if (s >= 0.8 && (!best || s > best.score)) best = { ...c, score: s };
    }
    draft.contactId = best?.id ?? null;
    draft.contactName = best ? best.label : name;
    draft.filled.push(`Görüşülen: ${draft.contactName}${best ? "" : " (yeni kişi)"}`);
  }
  for (const r of dict.contactRoles) {
    const syn: Record<string, string[]> = { sahip: ["patron", "sahibi", "sahip"], satin_alma: ["satin alma", "satinalma"], depo: ["depo"], muhasebe: ["muhasebe"] };
    const phrases = syn[r.value] ?? [norm(r.label)];
    if (phrases.some((p) => joined.includes(` ${p} `))) {
      draft.contactRole = r.value;
      break;
    }
  }

  // --- Competitors -----------------------------------------------------------
  const compHits = matchEntries(toks, dict.competitors, 0.72, dict.aliases, "competitor");
  const perComp = new Map<string, DraftCompetitor & { richness: number }>();
  for (const h of compHits) {
    const seg = segmentAfter(toks, h.end, 18);
    const prods = dict.competitorProducts.filter((p) => p.competitorId === h.id);
    let product: { id: string | null; name: string } = { id: null, name: "" };
    const ph = matchEntries(seg, prods.map((p) => ({ id: p.id, label: p.label })), 0.68, dict.aliases, "competitor_product")[0];
    if (ph) product = { id: ph.id, name: ph.label };
    else {
      const cat = matchEntries(seg, dict.categories.map((c) => ({ id: c.id, label: c.label })), 0.72, dict.aliases, "category")[0];
      if (cat) product = { id: null, name: cat.label };
    }
    const { price, vat } = readPrice(seg);
    const mentionedAsRival = toks[h.start - 1] === "rakip" || toks[h.start - 1] === "rakibi";
    const richness = (product.name ? 2 : 0) + (price != null ? 2 : 0) + (mentionedAsRival ? 1 : 0);
    const prev = perComp.get(h.id);
    // Only a plain shelf mention ("rafta Sista var") with nothing else is not a competitor observation.
    if (richness === 0 && !prev) continue;
    if (!prev || richness > prev.richness) {
      perComp.set(h.id, {
        competitorId: h.id,
        competitorName: h.label,
        productId: product.id,
        productName: product.name,
        price,
        vat,
        heard: toks.slice(h.start, h.end).join(" "),
        richness,
      });
    }
  }
  for (const c of perComp.values()) {
    const { richness: _r, ...rest } = c;
    void _r;
    draft.competitors.push(rest);
    draft.filled.push(`Rakip: ${c.competitorName}${c.productName ? ` ${c.productName}` : ""}${c.price != null ? ` ${c.price}${c.vat === false ? " +KDV" : c.vat === true ? " KDV dahil" : ""}` : ""}`);
  }
  // "rakip X" with an unknown name → unmatched hint.
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i] === "rakip" && !compHits.some((h) => h.start <= i + 1 && h.end > i + 1)) {
      const w = toks[i + 1];
      if (w && !["bilgisi", "var", "yok", "fiyat", "urun", "urunu"].includes(w) && !readNumber(toks, i + 1)) draft.unmatched.push(w);
    }
  }

  // --- Complaints -------------------------------------------------------------
  const complaintIdx: number[] = [];
  toks.forEach((w, i) => {
    if (w.startsWith("sikayet") && !/ sikayetci /.test(joined)) complaintIdx.push(i);
  });
  for (const i of complaintIdx) {
    const seg = segmentAfter(toks, i + 1, 30).filter((w) => !["var", "etti", "ediyor", "su", "soyle", "olarak"].includes(w));
    if (seg.length === 0) continue;
    // Take the original-cased text for the same word span when possible.
    draft.complaints.push({ description: seg.join(" ") });
    draft.filled.push(`Şikayet: ${seg.slice(0, 6).join(" ")}…`);
  }
  if (complaintIdx.length === 0 && / (teslimat gecikti|kirik geldi|hasarli|eksik geldi|yanlis urun) /.test(joined)) {
    const m = joined.match(/ (teslimat gecikti|kirik geldi|hasarli|eksik geldi|yanlis urun)[^.]*/);
    if (m) {
      draft.complaints.push({ description: m[0].trim() });
      draft.filled.push(`Şikayet: ${m[1]}`);
    }
  }

  // --- Stock -------------------------------------------------------------------
  const stockIdx = toks.findIndex((w) => w.startsWith("stok") || w === "depoda" || w === "depo");
  if (stockIdx >= 0 && dict.skus.length > 0) {
    const seg = segmentAfter(toks, stockIdx + 1, 60);
    // Every "N palet" → the words around it (until the previous / next number) name the product.
    const nums: { qty: number; at: number; next: number }[] = [];
    for (let i = 0; i < seg.length; i++) {
      const n = readNumber(seg, i);
      if (n && /^(palet|paletlik|paleti)$/.test(seg[n.next] ?? "")) {
        nums.push({ qty: n.value, at: i, next: n.next + 1 });
        i = n.next;
      }
    }
    // "4 palet X, 2 palet Y" (number first) vs "X'ten 4 palet, Y'den 2 palet" (product first).
    const numberFirst = nums.length > 0 && nums[0].at <= 1;
    for (let k = 0; k < nums.length; k++) {
      const cur = nums[k];
      const prevEnd = k > 0 ? nums[k - 1].next : 0;
      const nextStart = k + 1 < nums.length ? nums[k + 1].at : seg.length;
      const ctx = (numberFirst ? seg.slice(cur.next, nextStart) : seg.slice(prevEnd, cur.at)).filter(
        (w) => !["var", "kalmis", "duruyor", "ve", "ile", "de", "da"].includes(w)
      );
      if (ctx.length === 0) continue;
      let best: { id: string; label: string; score: number; matched: number } | null = null;
      let second = 0;
      for (const s of dict.skus) {
        const { matched, total } = tokenOverlap(ctx, s.key ?? s.label);
        if (matched === 0) continue;
        const score = matched / Math.max(1, total) + matched * 0.05;
        if (!best || score > best.score) {
          second = best?.score ?? 0;
          best = { id: s.id, label: s.label, score, matched };
        } else if (score > second) second = score;
      }
      for (const a of aliasHits(ctx, dict.aliases, "sku")) {
        const s = dict.skus.find((x) => x.id === a.id);
        if (s) {
          best = { id: s.id, label: s.label, score: 9, matched: 9 };
          second = 0;
        }
      }
      // Accept a clear winner: two shared words, half the name, or a single word no other SKU has.
      if (best && (best.matched >= 2 || best.score >= 0.5 || (best.matched >= 1 && second < best.score))) {
        draft.stock.push({ skuId: best.id, label: best.label, pallets: cur.qty });
        draft.filled.push(`Stok: ${best.label} ${cur.qty} palet`);
      }
    }
  }

  // --- Shelf info (Raf Bilgisi) -------------------------------------------------
  const brandHits = matchEntries(toks, dict.brands, 0.74, dict.aliases, "brand");
  const catHits = matchEntries(toks, dict.categories.map((c) => ({ id: c.id, label: c.label })), 0.72, dict.aliases, "category");
  if (brandHits.length > 0) {
    const byCat = new Map<string, Set<string>>();
    for (const b of brandHits) {
      // Category mentioned before the brand (closest on the left) wins; else every category offering that brand.
      const left = catHits.filter((c) => c.end <= b.start).sort((x, y) => y.start - x.start)[0];
      const offering = dict.categories.filter((c) => c.brandIds.includes(b.id)).map((c) => c.id);
      // Category said before the brand wins; otherwise only an unambiguous brand is placed.
      const cats = left ? [left.id] : offering.length === 1 ? offering : [];
      if (cats.length === 0) draft.unmatched.push(`${b.label} (hangi ürün? örn. "mastikte ${b.label} var")`);
      for (const cid of cats) (byCat.get(cid) ?? byCat.set(cid, new Set()).get(cid)!).add(b.id);
    }
    for (const [categoryId, ids] of byCat) {
      draft.products.push({ categoryId, brandIds: Array.from(ids), supply: "" });
    }
    const brandNames = brandHits.map((b) => b.label);
    draft.filled.push(`Raf: ${Array.from(new Set(brandNames)).join(", ")}`);
  }
  if ((/ kendi uretimi /.test(joined) && !/ kendi uretimi yok /.test(joined)) || (/ ihracat /.test(joined) && !/ ihracat yok /.test(joined))) {
    const supply = / kendi uretimi /.test(joined) ? "own_production" : "export";
    const c = catHits[0];
    if (c) {
      const p = draft.products.find((x) => x.categoryId === c.id);
      if (p) p.supply = supply;
      else draft.products.push({ categoryId: c.id, brandIds: [], supply });
    }
  }

  // --- Unmatched brand-like words after "marka" ----------------------------------
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i] === "marka" || toks[i] === "markasi") {
      const w = toks[i + 1];
      if (w && w.length > 2 && !brandHits.some((b) => b.start <= i + 1 && b.end > i + 1) && !readNumber(toks, i + 1)) draft.unmatched.push(w);
    }
  }
  draft.unmatched = Array.from(new Set(draft.unmatched));
  return draft;
}
