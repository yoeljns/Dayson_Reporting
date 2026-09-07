import type { CompanyKind } from "@/lib/enums";
import type { Survey } from "@/types/db";

export type SurveyTarget = {
  kind?: CompanyKind | null;
  plate?: string | null;
  repId?: string | null;
  /** YYYY-MM-DD; defaults to skipping the date window check. */
  date?: string | null;
};

/**
 * Does this survey apply to a company/rep/date? `null` target lists mean
 * "everyone". Company-dependent targeting (kind, plate) lives here because
 * RLS can only filter by rep and date.
 */
export function surveyMatches(
  s: Pick<
    Survey,
    "status" | "valid_from" | "valid_to" | "target_kinds" | "target_plates" | "target_reps"
  >,
  t: SurveyTarget
): boolean {
  if (s.status !== "aktif") return false;
  if (t.date) {
    if (s.valid_from && s.valid_from > t.date) return false;
    if (s.valid_to && s.valid_to < t.date) return false;
  }
  if (s.target_reps && s.target_reps.length > 0) {
    if (!t.repId || !s.target_reps.includes(t.repId)) return false;
  }
  if (s.target_kinds && s.target_kinds.length > 0) {
    if (!t.kind || !s.target_kinds.includes(t.kind)) return false;
  }
  if (s.target_plates && s.target_plates.length > 0) {
    if (!t.plate || !s.target_plates.includes(t.plate)) return false;
  }
  return true;
}

export type SelectOption = { value: string; label: string };

/** Normalised select options of a survey question. */
export function selectOptions(options: unknown): SelectOption[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) =>
      o && typeof o === "object" && "value" in o
        ? {
            value: String((o as { value: unknown }).value),
            label: String((o as { label?: unknown }).label ?? (o as { value: unknown }).value),
          }
        : null
    )
    .filter((o): o is SelectOption => o !== null && o.value !== "");
}

/** Scale bounds (default 1–5). */
export function scaleBounds(options: unknown): { min: number; max: number } {
  const o = (options ?? {}) as { min?: unknown; max?: unknown };
  const min = Number(o.min);
  const max = Number(o.max);
  if (Number.isFinite(min) && Number.isFinite(max) && max > min && max - min <= 10)
    return { min, max };
  return { min: 1, max: 5 };
}

/** True when an answer value counts as given. */
export function surveyAnswerGiven(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

/** Human label for one stored answer. */
export function formatSurveyAnswer(
  inputType: string,
  options: unknown,
  v: unknown
): string {
  if (!surveyAnswerGiven(v)) return "—";
  if (inputType === "boolean") return v === true || v === "true" ? "Evet" : "Hayır";
  if (inputType === "select") {
    const opt = selectOptions(options).find((o) => o.value === String(v));
    return opt?.label ?? String(v);
  }
  return String(v);
}
