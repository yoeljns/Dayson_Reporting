"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const { error } = await admin
    .from("questions")
    .update({ is_active: input.isActive })
    .eq("id", input.questionId);
  if (error) return { error: error.message };
  revalidatePath("/admin/sorular");
  return { ok: true };
}

/** Edit a question's label and required flag. */
export async function editQuestion(input: {
  questionId: string;
  labelTr: string;
  isRequired: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!input.labelTr.trim()) return { error: "Soru metni zorunludur." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("questions")
    .update({ label_tr: input.labelTr.trim(), is_required: input.isRequired })
    .eq("id", input.questionId);
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
