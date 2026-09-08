"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { FORM_KEYS, STRUCTURAL_REQUIRED, normalizeOptions, type FormKey } from "@/lib/form-fields";
import type { QuestionInputType } from "@/types/db";

const TYPES: QuestionInputType[] = ["text", "number", "boolean", "select", "multiselect", "date"];

function revalidate() {
  revalidatePath("/admin/formlar");
  revalidatePath("/sikayet/yeni");
  revalidatePath("/rakip/yeni");
  revalidatePath("/stok/yeni");
}

function isForm(v: string): v is FormKey {
  return (FORM_KEYS as readonly string[]).includes(v);
}

/** Add a custom field. */
export async function addFormField(input: {
  form: string;
  key: string;
  labelTr: string;
  inputType: QuestionInputType;
  isRequired: boolean;
  options?: { value: string; label: string }[] | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!isForm(input.form)) return { error: "Geçersiz form." };
  const key = input.key.trim();
  if (!/^[a-z0-9_]+$/.test(key)) return { error: "Kod yalnızca küçük harf, rakam ve _ içerebilir." };
  if (!input.labelTr.trim()) return { error: "Alan adı zorunludur." };
  if (!TYPES.includes(input.inputType)) return { error: "Geçersiz alan tipi." };
  let options: unknown = null;
  if (input.inputType === "select" || input.inputType === "multiselect") {
    options = normalizeOptions(
      (input.options ?? []).map((o) => ({ value: o.value.trim(), label: o.label.trim() }))
    );
    if (!options) return { error: "Seçenekli alan için en az bir seçenek girin." };
  }
  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("form_fields")
    .select("sort_order")
    .eq("form", input.form)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from("form_fields").insert({
    form: input.form,
    key,
    label_tr: input.labelTr.trim(),
    input_type: input.inputType,
    options,
    is_builtin: false,
    is_required: input.isRequired,
    sort_order: (maxRow?.sort_order ?? 0) + 10,
  });
  if (error) return { error: error.code === "23505" ? "Bu kod bu formda zaten var." : error.message };
  revalidate();
  return { ok: true };
}

/** Rename / required / options (custom only for options). */
export async function editFormField(input: {
  id: string;
  labelTr: string;
  isRequired: boolean;
  options?: { value: string; label: string }[] | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!input.labelTr.trim()) return { error: "Alan adı zorunludur." };
  const admin = createAdminClient();
  const { data: f } = await admin.from("form_fields").select("*").eq("id", input.id).maybeSingle();
  if (!f) return { error: "Alan bulunamadı." };
  const patch: Record<string, unknown> = {
    label_tr: input.labelTr.trim(),
    is_required: input.isRequired,
  };
  if (input.options !== undefined && !f.is_builtin && (f.input_type === "select" || f.input_type === "multiselect")) {
    const opts = normalizeOptions(
      (input.options ?? []).map((o) => ({ value: o.value.trim(), label: o.label.trim() }))
    );
    if (!opts) return { error: "Seçenekli alan için en az bir seçenek girin." };
    patch.options = opts;
  }
  const { error } = await admin.from("form_fields").update(patch).eq("id", input.id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function toggleFormField(input: {
  id: string;
  isActive: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: f } = await admin.from("form_fields").select("form, key, is_builtin").eq("id", input.id).maybeSingle();
  if (!f) return { error: "Alan bulunamadı." };
  if (!input.isActive && f.is_builtin && STRUCTURAL_REQUIRED[f.form as FormKey]?.includes(f.key))
    return { error: "Bu alan olmadan form kaydedilemez; pasifleştirilemez." };
  const { error } = await admin.from("form_fields").update({ is_active: input.isActive }).eq("id", input.id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function reorderFormField(input: {
  id: string;
  direction: "up" | "down";
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: me } = await admin.from("form_fields").select("form").eq("id", input.id).maybeSingle();
  if (!me) return { error: "Alan bulunamadı." };
  const { data } = await admin
    .from("form_fields")
    .select("id, sort_order")
    .eq("form", me.form)
    .order("sort_order")
    .order("created_at");
  const list = (data ?? []) as { id: string; sort_order: number }[];
  const i = list.findIndex((q) => q.id === input.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  const ladder = list.map((q, idx) => ({ id: q.id, sort_order: (idx + 1) * 10 }));
  const tmp = ladder[i].sort_order;
  ladder[i].sort_order = ladder[j].sort_order;
  ladder[j].sort_order = tmp;
  for (const row of ladder) {
    const { error } = await admin.from("form_fields").update({ sort_order: row.sort_order }).eq("id", row.id);
    if (error) return { error: error.message };
  }
  revalidate();
  return { ok: true };
}

/** Delete a custom field (answers already stored stay in extras, unread). */
export async function deleteFormField(input: { id: string }): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: f } = await admin.from("form_fields").select("is_builtin").eq("id", input.id).maybeSingle();
  if (!f) return { error: "Alan bulunamadı." };
  if (f.is_builtin) return { error: "Yerleşik alan silinemez; pasifleştirin." };
  const { error } = await admin.from("form_fields").delete().eq("id", input.id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
