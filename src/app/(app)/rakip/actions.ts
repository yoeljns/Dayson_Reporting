"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteDocumentsFor } from "@/lib/documents/server";
import { todayIso } from "@/lib/week";
import { cleanExtras, loadFormFields, missingRequiredField, type Extras } from "@/lib/form-fields";

/** Find an existing competitor by name (case-insensitive) or create it. */
export async function createCompetitor(
  name: string
): Promise<{ id?: string; name?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const n = name.trim();
  if (!n) return { error: "Rakip adı zorunludur." };

  const { data: existing } = await supabase
    .from("competitors")
    .select("id, name")
    .ilike("name", n)
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id, name: existing.name };

  const { data, error } = await supabase
    .from("competitors")
    .insert({ name: n })
    .select("id, name")
    .single();
  if (error) {
    // Lost a race or a case-variant exists — re-fetch.
    const { data: again } = await supabase
      .from("competitors")
      .select("id, name")
      .ilike("name", n)
      .limit(1)
      .maybeSingle();
    if (again) return { id: again.id, name: again.name };
    return { error: error.message };
  }
  return { id: data.id, name: data.name };
}

/** Find-or-create a competitor's catalog product ("Ürün" chips in the form). */
export async function addCompetitorProduct(input: {
  competitorId: string;
  name: string;
  categoryId?: string | null;
}): Promise<{ id?: string; name?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  const n = input.name.trim();
  if (!n) return { error: "Ürün adı zorunludur." };

  const find = async () =>
    (
      await supabase
        .from("competitor_products")
        .select("id, name")
        .eq("competitor_id", input.competitorId)
        .ilike("name", n)
        .limit(1)
        .maybeSingle()
    ).data;
  const existing = await find();
  if (existing) return { id: existing.id, name: existing.name };
  const { data, error } = await supabase
    .from("competitor_products")
    .insert({
      competitor_id: input.competitorId,
      name: n,
      category_id: input.categoryId || null,
      created_by: user.id,
    })
    .select("id, name")
    .single();
  if (error) {
    const again = await find();
    if (again) return { id: again.id, name: again.name };
    return { error: error.message };
  }
  return { id: data.id, name: data.name };
}

export async function saveObservation(input: {
  id?: string | null;
  /** Client-generated uuid for a NEW record (offline replay idempotency). */
  clientId?: string | null;
  competitorId?: string | null;
  competitorProductId?: string | null;
  companyId?: string | null;
  visitId?: string | null;
  productName: string;
  observedPrice?: number | null;
  /** true = KDV dahil, false = hariç, null = bilinmiyor */
  priceIncludesVat?: boolean | null;
  city?: string | null;
  note?: string | null;
  extras?: Extras | null;
  /** YYYY-MM-DD; defaults to today in Istanbul. */
  observedAt?: string | null;
  isDraft: boolean;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const fields = await loadFormFields(supabase, "rakip");
  const productName = input.productName.trim();
  const extras = cleanExtras(fields, input.extras);

  if (input.isDraft) {
    // The competitor is the subject of the record, so a draft needs at least it.
    if (!input.competitorId) return { error: "Taslak için rakip seçin." };
  } else {
    if (!input.competitorId) return { error: "Rakip seçiniz." };
    if (!productName) return { error: "Ürün adı zorunludur." };
    const missing = missingRequiredField(
      fields,
      {
        competitor: input.competitorId,
        product: productName,
        observed_price: input.observedPrice ?? null,
        price_includes_vat: input.priceIncludesVat == null ? null : String(input.priceIncludesVat),
        city: input.city?.trim() || null,
        company: input.companyId || null,
        note: input.note?.trim() || null,
      },
      extras
    );
    if (missing) return { error: `"${missing.label_tr}" alanı zorunludur.` };
  }

  const observedAt =
    input.observedAt && /^\d{4}-\d{2}-\d{2}$/.test(input.observedAt)
      ? input.observedAt
      : todayIso();
  const row = {
    competitor_id: input.competitorId || null,
    competitor_product_id: input.competitorProductId || null,
    company_id: input.companyId || null,
    visit_id: input.visitId || null,
    product_name: productName,
    observed_price: input.observedPrice ?? null,
    price_includes_vat: input.priceIncludesVat ?? null,
    city: input.city?.trim() || null,
    note: input.note?.trim() || null,
    extras,
    observed_at: observedAt,
    is_draft: input.isDraft,
  };

  let id = input.id || null;
  if (id) {
    const { data: ex } = await supabase
      .from("competitor_observations")
      .select("salesperson_id")
      .eq("id", id)
      .maybeSingle();
    if (!ex) return { error: "Kayıt bulunamadı." };
    if (ex.salesperson_id !== user.id)
      return { error: "Yalnızca kendi kaydınızı düzenleyebilirsiniz." };
    const { error } = await supabase
      .from("competitor_observations")
      .update(row)
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("competitor_observations")
      .insert({
        ...(input.clientId ? { id: input.clientId } : {}),
        ...row,
        salesperson_id: user.id,
      })
      .select("id")
      .single();
    if (error) {
      // Offline replay of an already-saved record → treat as success.
      if (error.code === "23505" && input.clientId) {
        id = input.clientId;
      } else {
        return { error: error.message };
      }
    } else {
      id = data.id;
    }
  }

  revalidatePath("/rakip");
  if (id) revalidatePath(`/rakip/${id}`);
  if (input.visitId) revalidatePath(`/ziyaret/${input.visitId}`);
  return { id: id ?? undefined };
}

/** Delete an observation (owner or manager) with its attachments. */
export async function deleteObservation(input: {
  observationId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  const { data: o } = await supabase
    .from("competitor_observations")
    .select("id, salesperson_id, company_id, visit_id")
    .eq("id", input.observationId)
    .maybeSingle();
  if (!o) return { error: "Kayıt bulunamadı." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isManager = me?.role === "manager" || me?.role === "admin";
  if (o.salesperson_id !== user.id && !isManager)
    return { error: "Yalnızca kendi kaydınızı silebilirsiniz." };
  await deleteDocumentsFor("competitor_observation", o.id);
  const { error } = await supabase.from("competitor_observations").delete().eq("id", o.id);
  if (error) return { error: error.message };
  revalidatePath("/rakip");
  revalidatePath("/admin/rakip-haritasi");
  if (o.visit_id) revalidatePath(`/ziyaret/${o.visit_id}`);
  if (o.company_id) {
    revalidatePath(`/firma/${o.company_id}`);
    revalidatePath(`/admin/bayi/${o.company_id}`);
  }
  return { ok: true };
}
