import { formatTRDate } from "@/lib/week";
import type { QuestionWithOptions, VisitAnswer } from "@/types/db";

/**
 * Turn a stored visit answer into the text a human should read.
 *
 * Mirrors the Excel report resolver (lib/reports/builders.ts) so a visit reads
 * the same on screen and on paper. Returns null when the question was left
 * blank, so callers can skip empty rows instead of printing "—" everywhere.
 */
export function answerText(
  q: QuestionWithOptions,
  a: VisitAnswer | undefined
): string | null {
  if (!a) return null;
  const opt = (v: string) =>
    q.question_options?.find((o) => o.value === v)?.label_tr ?? v;

  switch (q.input_type) {
    case "number":
      return a.value_number == null ? null : String(a.value_number);
    case "date":
      return a.value_date ? formatTRDate(a.value_date) : null;
    case "boolean":
      if (a.value_text === "evet") return "Evet";
      if (a.value_text === "hayir") return "Hayır";
      return a.value_text || null;
    case "select":
      return a.value_text ? opt(a.value_text) : null;
    case "multiselect":
      if (!a.value_text) return null;
      return a.value_text
        .split(",")
        .map((s) => opt(s.trim()))
        .filter(Boolean)
        .join(", ");
    default:
      return a.value_text || null; // text
  }
}

/** True when a question's free-text detail ("Diğer" açıklaması) should show. */
export function detailText(a: VisitAnswer | undefined): string | null {
  const d = a?.value_detail?.trim();
  return d ? d : null;
}

/** Questions worth printing: those that actually carry an answer or a detail. */
export function answeredQuestions(
  questions: QuestionWithOptions[],
  answers: VisitAnswer[]
): { q: QuestionWithOptions; value: string | null; detail: string | null }[] {
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  return questions
    .map((q) => {
      const a = byQ.get(q.id);
      return { q, value: answerText(q, a), detail: detailText(a) };
    })
    .filter((r) => r.value !== null || r.detail !== null);
}
