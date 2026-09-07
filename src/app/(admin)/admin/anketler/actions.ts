"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  COMPANY_KINDS,
  SURVEY_INPUT_TYPES,
  SURVEY_STATUSES,
  type CompanyKind,
  type SurveyInputType,
  type SurveyStatus,
} from "@/lib/enums";

function revalidate(id?: string) {
  revalidatePath("/admin/anketler");
  if (id) revalidatePath(`/admin/anketler/${id}`);
  revalidatePath("/anket");
  revalidatePath("/");
}

function isoOrNull(v?: string | null) {
  const s = (v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Create or update a survey's header (name, window, targeting). */
export async function saveSurvey(input: {
  id?: string | null;
  name: string;
  description?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  targetKinds?: CompanyKind[] | null;
  targetPlates?: string[] | null;
  targetReps?: string[] | null;
  allowRepeat: boolean;
}): Promise<{ id?: string; error?: string }> {
  const profile = await requireManager();
  const name = input.name.trim();
  if (!name) return { error: "Rapor adı zorunludur." };
  const kinds = (input.targetKinds ?? []).filter((k) =>
    (COMPANY_KINDS as readonly string[]).includes(k)
  );
  const plates = (input.targetPlates ?? [])
    .map((p) => p.trim())
    .filter((p) => /^[0-9]{2}$/.test(p));
  const reps = (input.targetReps ?? []).filter(Boolean);
  const from = isoOrNull(input.validFrom);
  const to = isoOrNull(input.validTo);
  if (from && to && from > to) return { error: "Bitiş tarihi başlangıçtan önce olamaz." };

  const row = {
    name,
    description: input.description?.trim() || null,
    valid_from: from,
    valid_to: to,
    target_kinds: kinds.length === 0 || kinds.length === COMPANY_KINDS.length ? null : kinds,
    target_plates: plates.length === 0 ? null : plates,
    target_reps: reps.length === 0 ? null : reps,
    allow_repeat: input.allowRepeat,
    updated_at: new Date().toISOString(),
  };
  const supabase = createClient();
  if (input.id) {
    const { error } = await supabase.from("surveys").update(row).eq("id", input.id);
    if (error) return { error: error.message };
    revalidate(input.id);
    return { id: input.id };
  }
  const { data, error } = await supabase
    .from("surveys")
    .insert({ ...row, created_by: profile.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidate(data.id);
  return { id: data.id };
}

export async function setSurveyStatus(input: {
  id: string;
  status: SurveyStatus;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  if (!(SURVEY_STATUSES as readonly string[]).includes(input.status))
    return { error: "Geçersiz durum." };
  const supabase = createClient();
  if (input.status === "aktif") {
    const { count } = await supabase
      .from("survey_questions")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", input.id);
    if (!count) return { error: "Soru eklemeden rapor yayınlanamaz." };
  }
  const { error } = await supabase
    .from("surveys")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { error: error.message };
  revalidate(input.id);
  return { ok: true };
}

export async function deleteSurvey(input: {
  id: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const supabase = createClient();
  const { count } = await supabase
    .from("survey_answers")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", input.id);
  if (count) return { error: "Cevap alınmış rapor silinemez; kapatın." };
  const { error } = await supabase.from("surveys").delete().eq("id", input.id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function upsertSurveyQuestion(input: {
  surveyId: string;
  questionId?: string | null;
  prompt: string;
  inputType: SurveyInputType;
  options?: { value: string; label: string }[] | null;
  scale?: { min: number; max: number } | null;
  isRequired: boolean;
}): Promise<{ id?: string; error?: string }> {
  await requireManager();
  const prompt = input.prompt.trim();
  if (!prompt) return { error: "Soru metni zorunludur." };
  if (!(SURVEY_INPUT_TYPES as readonly string[]).includes(input.inputType))
    return { error: "Geçersiz soru tipi." };
  let options: unknown = null;
  if (input.inputType === "select") {
    const opts = (input.options ?? [])
      .map((o) => ({ value: o.value.trim(), label: o.label.trim() }))
      .filter((o) => o.value && o.label);
    if (opts.length < 2) return { error: "Seçenekli soru için en az iki seçenek girin." };
    options = opts;
  } else if (input.inputType === "scale") {
    const min = Number(input.scale?.min ?? 1);
    const max = Number(input.scale?.max ?? 5);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || max - min > 10)
      return { error: "Puan aralığı geçersiz (örn. 1–5)." };
    options = { min, max };
  }
  const supabase = createClient();
  if (input.questionId) {
    const { error } = await supabase
      .from("survey_questions")
      .update({ prompt, input_type: input.inputType, options, is_required: input.isRequired })
      .eq("id", input.questionId);
    if (error) return { error: error.message };
    revalidate(input.surveyId);
    return { id: input.questionId };
  }
  const { data: maxRow } = await supabase
    .from("survey_questions")
    .select("sort_order")
    .eq("survey_id", input.surveyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("survey_questions")
    .insert({
      survey_id: input.surveyId,
      prompt,
      input_type: input.inputType,
      options,
      is_required: input.isRequired,
      sort_order: (maxRow?.sort_order ?? 0) + 10,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidate(input.surveyId);
  return { id: data.id };
}

export async function deleteSurveyQuestion(input: {
  surveyId: string;
  questionId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const supabase = createClient();
  const { error } = await supabase
    .from("survey_questions")
    .delete()
    .eq("id", input.questionId);
  if (error) return { error: error.message };
  revalidate(input.surveyId);
  return { ok: true };
}

export async function reorderSurveyQuestion(input: {
  surveyId: string;
  questionId: string;
  direction: "up" | "down";
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const supabase = createClient();
  const { data } = await supabase
    .from("survey_questions")
    .select("id, sort_order")
    .eq("survey_id", input.surveyId)
    .order("sort_order")
    .order("created_at");
  const list = (data ?? []) as { id: string; sort_order: number }[];
  const i = list.findIndex((q) => q.id === input.questionId);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  const ladder = list.map((q, idx) => ({ id: q.id, sort_order: (idx + 1) * 10 }));
  const tmp = ladder[i].sort_order;
  ladder[i].sort_order = ladder[j].sort_order;
  ladder[j].sort_order = tmp;
  for (const row of ladder) {
    const { error } = await supabase
      .from("survey_questions")
      .update({ sort_order: row.sort_order })
      .eq("id", row.id);
    if (error) return { error: error.message };
  }
  revalidate(input.surveyId);
  return { ok: true };
}
