/**
 * Question codes the visit wizard renders as dedicated steps. The codes are
 * reserved (a new question cannot reuse them); the questions themselves are
 * fully admin-managed — deactivating one simply removes its wizard step.
 */
export const FIXED_QUESTION_CODES = [
  "ziyaret_amaci",
  "sonraki_aksiyon",
  "sonraki_ziyaret_tarihi",
  "serbest_not",
  "hiz_veren_bayi",
  "gorusulen_kisi_rolu",
] as const;

export function isFixedQuestionCode(code: string): boolean {
  return (FIXED_QUESTION_CODES as readonly string[]).includes(code);
}
