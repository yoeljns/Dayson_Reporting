import { z } from "zod";
import { SEGMENTS, DEBT_STATUSES } from "@/lib/enums";

/** Canonical column keys we expect after header normalization. */
export const IMPORT_COLUMNS = [
  "logo_kodu",
  "bayi_adi",
  "segment",
  "borc_durumu",
  "sehir",
  "telefon",
  "pazarlamaci_email",
] as const;

/** Map various Turkish header spellings to canonical keys. */
const HEADER_ALIASES: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
  logo_kodu: "logo_kodu",
  logokodu: "logo_kodu",
  logo: "logo_kodu",
  kod: "logo_kodu",
  bayi_adi: "bayi_adi",
  bayiadi: "bayi_adi",
  bayi: "bayi_adi",
  firma: "bayi_adi",
  firma_adi: "bayi_adi",
  unvan: "bayi_adi",
  segment: "segment",
  borc_durumu: "borc_durumu",
  borcdurumu: "borc_durumu",
  borc: "borc_durumu",
  sehir: "sehir",
  il: "sehir",
  telefon: "telefon",
  tel: "telefon",
  pazarlamaci_email: "pazarlamaci_email",
  pazarlamaci: "pazarlamaci_email",
  email: "pazarlamaci_email",
  eposta: "pazarlamaci_email",
};

export function normalizeHeader(h: string): string {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[\s\-./]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function mapHeader(h: string): string | null {
  return HEADER_ALIASES[normalizeHeader(h)] ?? null;
}

const DEBT_LABEL_MAP: Record<string, (typeof DEBT_STATUSES)[number]> = {
  temiz: "temiz",
  riskli: "riskli",
  gecikmis: "gecikmis",
  gecikmiş: "gecikmis",
  bloke: "bloke",
};

export const importRowSchema = z.object({
  logo_kodu: z
    .string()
    .trim()
    .min(1, "Logo kodu boş olamaz"),
  bayi_adi: z.string().trim().min(1, "Bayi adı boş olamaz"),
  segment: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine(
      (v) => v === undefined || (SEGMENTS as readonly string[]).includes(v),
      "Segment A/B/C/D olmalı"
    ),
  borc_durumu: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? (DEBT_LABEL_MAP[v] ?? v) : undefined))
    .refine(
      (v) =>
        v === undefined || (DEBT_STATUSES as readonly string[]).includes(v),
      "Borç durumu geçersiz"
    ),
  sehir: z.string().trim().optional(),
  telefon: z.string().trim().optional(),
  pazarlamaci_email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type ImportRow = z.infer<typeof importRowSchema>;
