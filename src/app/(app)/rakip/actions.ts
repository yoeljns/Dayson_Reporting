"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

export async function saveObservation(input: {
  id?: string | null;
  competitorId?: string | null;
  companyId?: string | null;
  visitId?: string | null;
  productName: string;
  observedPrice?: number | null;
  city?: string | null;
  note?: string | null;
  isDraft: boolean;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const productName = input.productName.trim();

  if (input.isDraft) {
    // The competitor is the subject of the record, so a draft needs at least it.
    if (!input.competitorId) return { error: "Taslak için rakip seçin." };
  } else {
    if (!input.competitorId) return { error: "Rakip seçiniz." };
    if (!productName) return { error: "Ürün adı zorunludur." };
  }

  const row = {
    competitor_id: input.competitorId || null,
    company_id: input.companyId || null,
    visit_id: input.visitId || null,
    product_name: productName,
    observed_price: input.observedPrice ?? null,
    city: input.city?.trim() || null,
    note: input.note?.trim() || null,
    is_draft: input.isDraft,
  };

  let id = input.id || null;
  if (id) {
    const { error } = await supabase
      .from("competitor_observations")
      .update(row)
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("competitor_observations")
      .insert({ ...row, salesperson_id: user.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    id = data.id;
  }

  revalidatePath("/rakip");
  return { id: id ?? undefined };
}
