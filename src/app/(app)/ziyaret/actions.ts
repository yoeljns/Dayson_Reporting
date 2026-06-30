"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VisitType } from "@/lib/enums";

/** Create a non-customer company on the fly. Returns the new company id. */
export async function createNonCustomerCompany(input: {
  name: string;
  city?: string;
  phone?: string;
}): Promise<{ id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Firma adı zorunludur." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const { data, error } = await supabase
    .from("companies")
    .insert({
      kind: "non_customer",
      name,
      city: input.city?.trim() || null,
      phone: input.phone?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

/** Create a draft visit after just company + visit type are chosen. */
export async function createDraftVisit(input: {
  companyId: string;
  visitType: VisitType;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const { data, error } = await supabase
    .from("visits")
    .insert({
      company_id: input.companyId,
      salesperson_id: user.id,
      visit_type: input.visitType,
      status: "taslak",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/");
  return { id: data.id };
}

/** Soft-delete a visit (archive). Kept on record + visible to managers. */
export async function deleteVisit(
  visitId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const { error } = await supabase
    .from("visits")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", visitId);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/ziyaretler");
  return { ok: true };
}

/** Persist answers + optionally mark the visit completed. */
export async function saveVisit(input: {
  visitId: string;
  answers: Array<{
    questionId: string;
    valueText?: string | null;
    valueNumber?: number | null;
    valueDate?: string | null;
  }>;
  complete: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();

  // Upsert answers (delete-then-insert keeps it simple and RLS-safe).
  await supabase.from("visit_answers").delete().eq("visit_id", input.visitId);

  const rows = input.answers
    .filter(
      (a) =>
        a.valueText != null ||
        a.valueNumber != null ||
        a.valueDate != null
    )
    .map((a) => ({
      visit_id: input.visitId,
      question_id: a.questionId,
      value_text: a.valueText ?? null,
      value_number: a.valueNumber ?? null,
      value_date: a.valueDate ?? null,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("visit_answers").insert(rows);
    if (error) return { error: error.message };
  }

  const { error: vErr } = await supabase
    .from("visits")
    .update({
      status: input.complete ? "tamamlandi" : "taslak",
      completed_at: input.complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.visitId);

  if (vErr) return { error: vErr.message };
  revalidatePath("/");
  revalidatePath("/ziyaretler");
  return { ok: true };
}
