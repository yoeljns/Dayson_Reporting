"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFixedQuestionCode } from "@/lib/question-codes";
import {
  VISIT_TYPES,
  COMPANY_KINDS,
  type VisitType,
  type CompanyKind,
} from "@/lib/enums";
import type { QuestionInputType } from "@/types/db";

const VALID_TYPES: QuestionInputType[] = [
  "select",
  "multiselect",
  "boolean",
  "number",
  "date",
  "text",
];

export async function addQuestion(input: {
  code: string;
  labelTr: string;
  inputType: QuestionInputType;
  isRequired: boolean;
  options: { value: string; labelTr: string }[];
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const code = input.code.trim();
  if (!/^[a-z0-9_]+$/.test(code)) {
    return { error: "Kod yalnızca küçük harf, rakam ve _ içerebilir." };
  }
  if (!input.labelTr.trim()) return { error: "Soru metni zorunludur." };
  if (!VALID_TYPES.includes(input.inputType))
    return { error: "Geçersiz alan tipi." };
  if (isFixedQuestionCode(code))
    return { error: "Bu kod sihirbazın sabit sorularına ayrılmıştır." };

  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("questions")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 10;

  const { data: q, error } = await admin
    .from("questions")
    .insert({
      code,
      label_tr: input.labelTr.trim(),
      input_type: input.inputType,
      is_required: input.isRequired,
      sort_order: nextOrder,
    })
    .select("id")
    .single();
  if (error || !q) return { error: error?.message ?? "Eklenemedi." };

  const opts = input.options.filter((o) => o.value.trim() && o.labelTr.trim());
  if (opts.length > 0) {
    await admin.from("question_options").insert(
      opts.map((o, i) => ({
        question_id: q.id,
        value: o.value.trim(),
        label_tr: o.labelTr.trim(),
        sort_order: i + 1,
      }))
    );
  }
  revalidatePath("/admin/sorular");
  return { ok: true };
}

export async function toggleQuestionActive(input: {
  questionId: string;
  isActive: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  if (!input.isActive) {
    const { data: q } = await admin
      .from("questions")
      .select("code")
      .eq("id", input.questionId)
      .maybeSingle();
    if (q && isFixedQuestionCode(q.code))
      return {
        error:
          "Bu soru sihirbazın sabit adımlarından biri; pasifleştirilemez. Zorunluluğunu kaldırabilirsiniz.",
      };
  }
  const { error } = await admin
    .from("questions")
    .update({ is_active: input.isActive })
    .eq("id", input.questionId);
  if (error) return { error: error.message };
  revalidatePath("/admin/sorular");
  return { ok: true };
}

/** Edit a question's label, required flag and where it applies. */
export async function editQuestion(input: {
  questionId: string;
  labelTr: string;
  isRequired: boolean;
  /** null = every channel */
  appliesTo?: VisitType[] | null;
  /** null = every company kind */
  appliesToKind?: CompanyKind[] | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!input.labelTr.trim()) return { error: "Soru metni zorunludur." };
  const patch: Record<string, unknown> = {
    label_tr: input.labelTr.trim(),
    is_required: input.isRequired,
  };
  if (input.appliesTo !== undefined) {
    const list = (input.appliesTo ?? []).filter((v) =>
      (VISIT_TYPES as readonly string[]).includes(v)
    );
    patch.applies_to = list.length === 0 || list.length === VISIT_TYPES.length ? null : list;
  }
  if (input.appliesToKind !== undefined) {
    const list = (input.appliesToKind ?? []).filter((v) =>
      (COMPANY_KINDS as readonly string[]).includes(v)
    );
    patch.applies_to_kind =
      list.length === 0 || list.length === COMPANY_KINDS.length ? null : list;
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("questions")
    .update(patch)
    .eq("id", input.questionId);
  if (error) return { error: error.message };
  revalidatePath("/admin/sorular");
  return { ok: true };
}

/** Move a question one step up or down in the wizard order. */
export async function reorderQuestion(input: {
  questionId: string;
  direction: "up" | "down";
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: all } = await admin
    .from("questions")
    .select("id, sort_order")
    .order("sort_order")
    .order("created_at");
  const list = (all ?? []) as { id: string; sort_order: number }[];
  const i = list.findIndex((q) => q.id === input.questionId);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  // Normalise to a strict 10-step ladder, then swap the two neighbours.
  const ladder = list.map((q, idx) => ({ id: q.id, sort_order: (idx + 1) * 10 }));
  const tmp = ladder[i].sort_order;
  ladder[i].sort_order = ladder[j].sort_order;
  ladder[j].sort_order = tmp;
  for (const row of ladder) {
    const { error } = await admin
      .from("questions")
      .update({ sort_order: row.sort_order })
      .eq("id", row.id);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/sorular");
  return { ok: true };
}

/** Add or rename an option of a select/multiselect question. */
export async function upsertOption(input: {
  questionId: string;
  optionId?: string | null;
  value: string;
  labelTr: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const value = input.value.trim();
  const label = input.labelTr.trim();
  if (!/^[a-z0-9_]+$/.test(value))
    return { error: "Değer yalnızca küçük harf, rakam ve _ içerebilir." };
  if (!label) return { error: "Seçenek etiketi zorunludur." };
  const admin = createAdminClient();
  if (input.optionId) {
    const { error } = await admin
      .from("question_options")
      .update({ value, label_tr: label })
      .eq("id", input.optionId);
    if (error) return { error: error.message };
  } else {
    const { data: maxRow } = await admin
      .from("question_options")
      .select("sort_order")
      .eq("question_id", input.questionId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await admin.from("question_options").insert({
      question_id: input.questionId,
      value,
      label_tr: label,
      sort_order: (maxRow?.sort_order ?? 0) + 1,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/sorular");
  return { ok: true };
}

/** Remove an option. Existing answers keep their raw value. */
export async function deleteOption(input: {
  optionId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("question_options")
    .delete()
    .eq("id", input.optionId);
  if (error) return { error: error.message };
  revalidatePath("/admin/sorular");
  return { ok: true };
}

/** Delete a question (blocked by the FK if it already has answers). */
export async function deleteQuestion(input: {
  questionId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: q } = await admin
    .from("questions")
    .select("code")
    .eq("id", input.questionId)
    .maybeSingle();
  if (q && isFixedQuestionCode(q.code))
    return { error: "Sihirbazın sabit soruları silinemez." };
  const { error } = await admin
    .from("questions")
    .delete()
    .eq("id", input.questionId);
  if (error)
    return {
      error:
        "Silinemedi — bu soruya bağlı geçmiş cevaplar olabilir. Bunun yerine pasifleştirin.",
    };
  revalidatePath("/admin/sorular");
  return { ok: true };
}
