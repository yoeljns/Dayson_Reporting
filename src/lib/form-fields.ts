import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestionInputType } from "@/types/db";

/**
 * Admin-managed field catalog for the three field forms (şikayet, rakip
 * bilgisi, stok sayımı). Built-in fields map to real columns/widgets in the
 * form; custom fields are stored in the record's `extras` jsonb.
 */
export type FormKey = "sikayet" | "rakip" | "stok";
export const FORM_KEYS: readonly FormKey[] = ["sikayet", "rakip", "stok"];
export const FORM_LABELS: Record<FormKey, string> = {
  sikayet: "Şikayet",
  rakip: "Rakip bilgisi",
  stok: "Stok sayımı",
};

export interface FormField {
  id: string;
  form: FormKey;
  key: string;
  label_tr: string;
  input_type: QuestionInputType;
  options: { value: string; label: string }[] | null;
  is_builtin: boolean;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
}

/** Built-in keys the form cannot work without (cannot be deactivated). */
export const STRUCTURAL_REQUIRED: Record<FormKey, string[]> = {
  sikayet: ["description"],
  rakip: ["competitor", "product"],
  stok: ["company", "lines"],
};

export type ExtraValue = string | number | boolean | null;
export type Extras = Record<string, ExtraValue>;

/** All fields of a form (active and inactive), in display order. */
export async function loadFormFields(
  supabase: SupabaseClient,
  form: FormKey,
  opts: { includeInactive?: boolean } = {}
): Promise<FormField[]> {
  let q = supabase
    .from("form_fields")
    .select("*")
    .eq("form", form)
    .order("sort_order")
    .order("created_at");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data } = await q;
  return ((data as FormField[] | null) ?? []).map((f) => ({
    ...f,
    options: normalizeOptions(f.options),
  }));
}

export function normalizeOptions(v: unknown): { value: string; label: string }[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((o) =>
      o && typeof o === "object" && "value" in o
        ? {
            value: String((o as { value: unknown }).value),
            label: String((o as { label?: unknown }).label ?? (o as { value: unknown }).value),
          }
        : null
    )
    .filter((o): o is { value: string; label: string } => o !== null && o.value !== "");
  return out.length > 0 ? out : null;
}

export function fieldOn(fields: FormField[], key: string): boolean {
  const f = fields.find((x) => x.key === key);
  return f ? f.is_active : true; // unknown key = legacy form, keep showing
}
export function fieldRequired(fields: FormField[], key: string): boolean {
  return Boolean(fields.find((x) => x.key === key)?.is_required);
}
export function labelOf(fields: FormField[], key: string, fallback: string): string {
  return fields.find((x) => x.key === key)?.label_tr ?? fallback;
}
export function customFields(fields: FormField[]): FormField[] {
  return fields.filter((f) => !f.is_builtin && f.is_active);
}

export function extraGiven(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

/**
 * First required field without a value, or null. `builtin` holds the form's
 * built-in values keyed by field key; `extras` the custom answers.
 */
export function missingRequiredField(
  fields: FormField[],
  builtin: Record<string, unknown>,
  extras: Extras
): FormField | null {
  for (const f of fields) {
    if (!f.is_active || !f.is_required) continue;
    if (f.key === "photos") continue; // never blocking
    const v = f.is_builtin ? builtin[f.key] : extras[f.key];
    if (!extraGiven(v)) return f;
  }
  return null;
}

/** Keep only known, active custom keys; coerce by type. */
export function cleanExtras(fields: FormField[], raw: unknown): Extras {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Extras = {};
  for (const f of customFields(fields)) {
    const v = src[f.key];
    if (!extraGiven(v)) continue;
    switch (f.input_type) {
      case "number": {
        const n = Number(v);
        if (Number.isFinite(n)) out[f.key] = n;
        break;
      }
      case "boolean":
        out[f.key] = v === true || v === "true" || v === "evet";
        break;
      default:
        out[f.key] = String(v).slice(0, 2000);
    }
  }
  return out;
}

/** Human label of one extra value. */
export function formatExtra(f: FormField, v: unknown): string {
  if (!extraGiven(v)) return "—";
  if (f.input_type === "boolean") return v === true || v === "true" ? "Evet" : "Hayır";
  if (f.input_type === "select" || f.input_type === "multiselect") {
    const opts = f.options ?? [];
    return String(v)
      .split(",")
      .map((s) => opts.find((o) => o.value === s.trim())?.label ?? s.trim())
      .join(", ");
  }
  return String(v);
}
