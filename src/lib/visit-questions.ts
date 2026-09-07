import type { QuestionWithOptions } from "@/types/db";
import type { VisitType, CompanyKind } from "@/lib/enums";

/**
 * Shared question rules — the wizard, the visit page and the server action all
 * derive "which questions apply" and "is this answer complete" from here, so
 * the required list is identical on both sides by construction.
 */

/** Active questions that apply to this visit's channel and company kind. */
export function applicableQuestions(
  questions: QuestionWithOptions[],
  visitType: VisitType,
  kind: CompanyKind | null | undefined
): QuestionWithOptions[] {
  return questions.filter((q) => {
    if (!q.is_active) return false;
    if (q.applies_to && !q.applies_to.includes(visitType)) return false;
    if (q.applies_to_kind && kind && !q.applies_to_kind.includes(kind))
      return false;
    return true;
  });
}

/** Non-empty answer; a "Diğer" choice additionally needs its free-text detail. */
export function answerIsComplete(
  q: Pick<QuestionWithOptions, "input_type">,
  value: string | number | null | undefined,
  detail: string | null | undefined
): boolean {
  const v = value == null ? "" : String(value).trim();
  if (!v) return false;
  if (q.input_type === "select" || q.input_type === "multiselect") {
    const picks = v.split(",").map((s) => s.trim());
    if (picks.includes("diger")) return !!(detail ?? "").trim();
  }
  return true;
}

/**
 * First required question without a complete answer, or null. `skip` lets the
 * caller hide conditional questions (e.g. "sipariş alınmama nedeni" only when
 * "sipariş alındı" is "hayır").
 */
export function missingRequired(
  questions: QuestionWithOptions[],
  values: Record<string, string | number | null | undefined>,
  details: Record<string, string | null | undefined>,
  skip?: (q: QuestionWithOptions) => boolean
): QuestionWithOptions | null {
  for (const q of questions) {
    if (!q.is_required) continue;
    if (skip?.(q)) continue;
    if (!answerIsComplete(q, values[q.id], details[q.id])) return q;
  }
  return null;
}

/** The one conditional question in the catalog: reason only when no order. */
export function conditionalSkip(
  byCode: Map<string, QuestionWithOptions>,
  values: Record<string, string | number | null | undefined>
): (q: QuestionWithOptions) => boolean {
  const sip = byCode.get("siparis_alindi");
  return (q) =>
    q.code === "siparis_alinmama_nedeni" &&
    !(sip && String(values[sip.id] ?? "") === "hayir");
}
