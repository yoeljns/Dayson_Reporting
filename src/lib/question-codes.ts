/**
 * Question codes the visit wizard hard-wires into dedicated steps. They cannot
 * be deleted or deactivated from the catalog — doing so would silently remove
 * a wizard step. Everything else in the catalog is admin-managed.
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
