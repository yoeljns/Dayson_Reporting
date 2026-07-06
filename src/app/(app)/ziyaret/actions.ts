"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/week";
import type { VisitType, SupplyKind } from "@/lib/enums";

/** True when `s` is a REAL calendar date (YYYY-MM-DD) on or before `today`.
 *  The regex alone would accept impossible dates like 2026-02-30, which then
 *  blow up at the Postgres date insert — round-trip through Date to reject them. */
function isValidVisitDate(s: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    return false;
  }
  return s <= today;
}

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

/** Create a draft visit after just company + visit type are chosen.
 *  visitDate lets a rep log a forgotten past visit; future dates are rejected
 *  back to today. */
export async function createDraftVisit(input: {
  companyId: string;
  visitType: VisitType;
  visitDate?: string;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  // Explicit Istanbul date — the DB default is current_date in UTC, which
  // mis-dates visits logged between 00:00 and 03:00 TR. Accept a chosen past
  // date, but never a malformed or future one.
  const today = todayIso();
  const picked = input.visitDate?.trim();
  const visitDate = picked && isValidVisitDate(picked, today) ? picked : today;

  const { data, error } = await supabase
    .from("visits")
    .insert({
      company_id: input.companyId,
      salesperson_id: user.id,
      visit_type: input.visitType,
      status: "taslak",
      visit_date: visitDate,
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

/** Create (or reuse) a company contact and return its id. */
export async function upsertContact(input: {
  companyId: string;
  name: string;
  phone?: string | null;
  role?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Kişi adı zorunludur." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  // Reuse an existing contact for this company (case-insensitive name).
  const { data: existing } = await supabase
    .from("company_contacts")
    .select("id")
    .eq("company_id", input.companyId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data, error } = await supabase
    .from("company_contacts")
    .insert({
      company_id: input.companyId,
      name,
      phone: input.phone?.trim() || null,
      role: input.role?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

/** Set (or clear) the contact met on a visit. */
export async function setVisitContact(input: {
  visitId: string;
  contactId: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("visits")
    .update({ contact_id: input.contactId, updated_at: new Date().toISOString() })
    .eq("id", input.visitId);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Add a custom brand to a category for the current salesperson ("Diğer").
 * Reuses an existing brand by case-insensitive name; links it to the category
 * scoped to this rep so it is suggested to them next time.
 */
export async function addCustomBrand(input: {
  categoryId: string;
  name: string;
}): Promise<{ brandId?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Marka adı zorunludur." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  // Find an existing brand (case-insensitive) or create it. If a concurrent
  // insert wins the unique(lower(name)) race, re-select instead of erroring.
  const findBrand = async () =>
    (
      await supabase
        .from("product_brands")
        .select("id")
        .ilike("name", name)
        .limit(1)
        .maybeSingle()
    ).data?.id as string | undefined;

  let brandId = await findBrand();
  if (!brandId) {
    const { data: created, error: bErr } = await supabase
      .from("product_brands")
      .insert({ name, created_by: user.id })
      .select("id")
      .single();
    if (created) brandId = created.id;
    else {
      brandId = await findBrand(); // lost the race → reuse the winner
      if (!brandId) return { error: bErr?.message ?? "Marka eklenemedi." };
    }
  }

  // Link to the category for this rep if not already linked. (A column-list
  // upsert can't infer the PARTIAL unique index, so check-then-insert.)
  const { data: link } = await supabase
    .from("product_category_brands")
    .select("id")
    .eq("category_id", input.categoryId)
    .eq("brand_id", brandId)
    .eq("salesperson_id", user.id)
    .maybeSingle();
  if (!link) {
    const { error: lErr } = await supabase.from("product_category_brands").insert({
      category_id: input.categoryId,
      brand_id: brandId,
      salesperson_id: user.id,
      is_own: false,
    });
    // A duplicate (23505) from a concurrent add is fine; anything else surfaces.
    if (lErr && lErr.code !== "23505") return { error: lErr.message };
  }

  revalidatePath("/ziyaret");
  return { brandId };
}

/** Replace the product-competition selections for a visit. */
export async function saveVisitProducts(input: {
  visitId: string;
  selections: Array<{
    categoryId: string;
    brandId?: string | null;
    customName?: string | null;
    supplyKind?: SupplyKind;
  }>;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();

  // Atomic delete+insert via RPC so a failed insert never wipes prior answers.
  const rows = input.selections.map((s) => ({
    category_id: s.categoryId,
    brand_id: s.brandId ?? null,
    custom_name: s.customName?.trim() || null,
    supply_kind: s.supplyKind ?? "brand",
  }));

  const { error } = await supabase.rpc("replace_visit_products", {
    p_visit_id: input.visitId,
    p_rows: rows,
  });
  if (error) return { error: error.message };
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
    valueDetail?: string | null;
  }>;
  complete: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();

  // Atomic delete+insert via RPC so a failed insert never wipes prior answers.
  const rows = input.answers
    .filter(
      (a) =>
        a.valueText != null ||
        a.valueNumber != null ||
        a.valueDate != null
    )
    .map((a) => ({
      question_id: a.questionId,
      value_text: a.valueText ?? null,
      value_number: a.valueNumber == null ? null : String(a.valueNumber),
      value_date: a.valueDate ?? null,
      value_detail: a.valueDetail ?? null,
    }));

  const { error } = await supabase.rpc("replace_visit_answers", {
    p_visit_id: input.visitId,
    p_rows: rows,
  });
  if (error) return { error: error.message };

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
