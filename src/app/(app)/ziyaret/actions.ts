"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/week";
import { validLatLng } from "@/lib/geo";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceKey } from "@/lib/supabase/env";
import {
  FIELD_REGISTRABLE_KINDS,
  type VisitType,
  type SupplyKind,
  type CompanyKind,
  VISIT_TYPES,
} from "@/lib/enums";
import type { QuestionWithOptions } from "@/types/db";
import {
  contactRequired,
  applicableQuestions,
  missingRequired,
  conditionalSkip,
} from "@/lib/visit-questions";

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

/**
 * Register a company from the field (potansiyel bayi / alt bayi / rakip
 * noktası). The RPC creates the row AND assigns the caller in one transaction,
 * so the rep immediately sees the firm in their list. `clientId` makes offline
 * replays idempotent.
 */
export async function registerCompanyFromField(input: {
  kind: CompanyKind;
  name: string;
  city?: string | null;
  plateCode?: string | null;
  phone?: string | null;
  buysFromCompanyId?: string | null;
  notes?: string | null;
  clientId?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Firma adı zorunludur." };
  if (!(FIELD_REGISTRABLE_KINDS as readonly string[]).includes(input.kind))
    return { error: "Sahadan yalnızca potansiyel bayi veya diğer firma eklenebilir." };
  const plate = (input.plateCode ?? "").trim();
  if (plate && !/^[0-9]{2}$/.test(plate))
    return { error: "Plaka kodu 2 haneli olmalı (örn. 34)." };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("register_company_from_field", {
    p_kind: input.kind,
    p_name: name,
    p_city: input.city?.trim() || null,
    p_plate_code: plate || null,
    p_phone: input.phone?.trim() || null,
    p_buys_from_company_id: input.buysFromCompanyId || null,
    p_notes: input.notes?.trim() || null,
    p_id: input.clientId || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/firmalar");
  revalidatePath("/son-ziyaretler");
  return { id: data as string };
}

/** Legacy name kept for older call sites — registers a potansiyel bayi. */
export async function createNonCustomerCompany(input: {
  name: string;
  city?: string;
  phone?: string;
}): Promise<{ id?: string; error?: string }> {
  return registerCompanyFromField({
    kind: "non_customer",
    name: input.name,
    city: input.city ?? null,
    phone: input.phone ?? null,
  });
}

/** Create a draft visit after just company + visit type are chosen.
 *  visitDate lets a rep log a forgotten past visit; future dates are rejected
 *  back to today. */
export async function createDraftVisit(input: {
  companyId: string;
  visitType: VisitType;
  visitDate?: string;
  /** Client-generated uuid so an offline replay never creates the visit twice. */
  id?: string;
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
      ...(input.id ? { id: input.id } : {}),
      company_id: input.companyId,
      salesperson_id: user.id,
      visit_type: input.visitType,
      status: "taslak",
      visit_date: visitDate,
    })
    .select("id")
    .single();

  if (error) {
    // Replayed from the offline queue: the row already exists → success.
    if (error.code === "23505" && input.id) {
      const { data: again } = await supabase
        .from("visits")
        .select("id")
        .eq("id", input.id)
        .maybeSingle();
      if (again) return { id: again.id };
    }
    return { error: error.message };
  }
  revalidatePath("/");
  return { id: data.id };
}

/** Soft-delete one's own visit (any status). Kept on record; the office can
 *  restore it from "Silinen ziyaretler". */
export async function deleteVisit(
  visitId: string
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const { data: v } = await supabase
    .from("visits")
    .select("salesperson_id")
    .eq("id", visitId)
    .maybeSingle();
  if (!v) return { error: "Ziyaret bulunamadı." };
  if (v.salesperson_id !== user.id)
    return { error: "Yalnızca kendi ziyaretinizi silebilirsiniz." };

  const { error } = await supabase
    .from("visits")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", visitId);
  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/ziyaretler");
  return { ok: true };
}

/** Change a visit's date afterwards (owner only, any status). Future dates
 *  are rejected; reports and "son ziyaret" views follow visit_date. */
export async function updateVisitDate(input: {
  visitId: string;
  visitDate: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const picked = (input.visitDate ?? "").trim();
  if (!isValidVisitDate(picked, todayIso()))
    return { error: "Geçersiz tarih. Bugün veya geçmiş bir gün seçin." };

  const { data: v } = await supabase
    .from("visits")
    .select("salesperson_id, deleted_at, company_id")
    .eq("id", input.visitId)
    .maybeSingle();
  if (!v) return { error: "Ziyaret bulunamadı." };
  if (v.salesperson_id !== user.id)
    return { error: "Yalnızca kendi ziyaretinizin tarihini değiştirebilirsiniz." };
  if (v.deleted_at) return { error: "Silinmiş ziyaret düzenlenemez." };

  const { error } = await supabase
    .from("visits")
    .update({ visit_date: picked, updated_at: new Date().toISOString() })
    .eq("id", input.visitId);
  if (error) return { error: error.message };

  for (const p of [
    "/",
    "/ziyaretler",
    `/ziyaret/${input.visitId}`,
    "/plan",
    "/son-ziyaretler",
    "/firmalar",
    `/firma/${v.company_id}`,
    "/admin/ziyaretler",
    `/admin/bayi/${v.company_id}`,
  ])
    revalidatePath(p);
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
  /** One-shot GPS fix from the device when completing (optional, rep's choice). */
  location?: { lat: number; lng: number; accuracy: number | null } | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  // Ownership + state: only the author writes, and only drafts (or a
  // re-edited completed visit of their own) — never someone else's record.
  const { data: visit } = await supabase
    .from("visits")
    .select("salesperson_id, visit_type, deleted_at, contact_id, companies(kind), company_id")
    .eq("id", input.visitId)
    .maybeSingle();
  if (!visit) return { error: "Ziyaret bulunamadı." };
  if (visit.salesperson_id !== user.id)
    return { error: "Bu ziyaret size ait değil." };
  if (visit.deleted_at) return { error: "Silinmiş ziyaret düzenlenemez." };

  if (input.complete) {
    // Server-side required check with the SAME rules as the wizard, so a
    // direct call cannot complete a visit with missing mandatory answers.
    const { data: qs } = await supabase
      .from("questions")
      .select("*, question_options(*)")
      .eq("is_active", true)
      .order("sort_order");
    const companyKind = (
      Array.isArray(visit.companies) ? visit.companies[0] : visit.companies
    ) as { kind: CompanyKind } | null;
    const applicable = applicableQuestions(
      (qs as QuestionWithOptions[] | null) ?? [],
      visit.visit_type as VisitType,
      companyKind?.kind ?? null
    );
    const values: Record<string, string | number | null> = {};
    const details: Record<string, string | null> = {};
    for (const a of input.answers) {
      values[a.questionId] =
        a.valueText ?? (a.valueNumber == null ? null : a.valueNumber) ?? a.valueDate ?? null;
      details[a.questionId] = a.valueDetail ?? null;
    }
    const byCode = new Map(applicable.map((q) => [q.code, q]));
    const missing = missingRequired(
      applicable,
      values,
      details,
      conditionalSkip(byCode, values)
    );
    if (missing) return { error: `"${missing.label_tr}" alanı zorunludur.` };
    if (contactRequired(applicable) && !visit.contact_id)
      return { error: "Görüşülen kişi zorunludur." };
  }

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

  const loc = input.location ? validLatLng(input.location.lat, input.location.lng) : null;
  const accuracy = loc && Number.isFinite(Number(input.location?.accuracy)) ? Math.round(Number(input.location?.accuracy)) : null;
  const { error: vErr } = await supabase
    .from("visits")
    .update({
      status: input.complete ? "tamamlandi" : "taslak",
      completed_at: input.complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      ...(loc ? { lat: loc.lat, lng: loc.lng, accuracy_m: accuracy, located_at: new Date().toISOString() } : {}),
    })
    .eq("id", input.visitId);

  if (vErr) return { error: vErr.message };

  // First accurate face-to-face completion teaches the company's pin (office can reset it).
  if (loc && input.complete && visit.visit_type === "yuz_yuze" && (accuracy == null || accuracy <= 150) && hasServiceKey()) {
    const admin = createAdminClient();
    const { data: c } = await admin.from("companies").select("lat").eq("id", visit.company_id).maybeSingle();
    if (c && c.lat == null) {
      await admin
        .from("companies")
        .update({ lat: loc.lat, lng: loc.lng, location_source: "first_visit", located_at: new Date().toISOString() })
        .eq("id", visit.company_id);
    }
  }
  revalidatePath("/");
  revalidatePath("/ziyaretler");
  return { ok: true };
}

/** Change a draft/completed visit's type (owner only). */
export async function updateVisitType(input: {
  visitId: string;
  visitType: VisitType;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  if (!(VISIT_TYPES as readonly string[]).includes(input.visitType)) return { error: "Geçersiz ziyaret türü." };
  const { data: v } = await supabase
    .from("visits")
    .select("salesperson_id, deleted_at, company_id")
    .eq("id", input.visitId)
    .maybeSingle();
  if (!v) return { error: "Ziyaret bulunamadı." };
  if (v.salesperson_id !== user.id) return { error: "Yalnızca kendi ziyaretinizi düzenleyebilirsiniz." };
  if (v.deleted_at) return { error: "Silinmiş ziyaret düzenlenemez." };
  const { error } = await supabase
    .from("visits")
    .update({ visit_type: input.visitType, updated_at: new Date().toISOString() })
    .eq("id", input.visitId);
  if (error) return { error: error.message };
  revalidatePath(`/ziyaret/${input.visitId}`);
  revalidatePath("/ziyaretler");
  return { ok: true };
}

/**
 * Reporting metric for one visit: active seconds are accumulated, mode and
 * voice flags overwritten, completed_at set once the visit is completed.
 */
export async function recordVisitMetric(input: {
  visitId: string;
  secondsActive: number;
  mode: "hizli" | "detayli";
  voiceUsed: boolean;
  voiceChars: number;
  completed: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  const secs = Math.max(0, Math.min(6 * 3600, Math.round(Number(input.secondsActive) || 0)));
  const mode = input.mode === "detayli" ? "detayli" : "hizli";
  const { data: ex } = await supabase
    .from("visit_metrics")
    .select("seconds_active, voice_used, voice_chars, completed_at")
    .eq("visit_id", input.visitId)
    .maybeSingle();
  const now = new Date().toISOString();
  const row = {
    visit_id: input.visitId,
    seconds_active: (Number(ex?.seconds_active) || 0) + secs,
    mode,
    voice_used: Boolean(ex?.voice_used) || Boolean(input.voiceUsed),
    voice_chars: (Number(ex?.voice_chars) || 0) + Math.max(0, Math.round(Number(input.voiceChars) || 0)),
    completed_at: input.completed ? now : (ex?.completed_at ?? null),
    updated_at: now,
  };
  const { error } = await supabase.from("visit_metrics").upsert(row, { onConflict: "visit_id" });
  if (error) return { error: error.message };
  return { ok: true };
}
