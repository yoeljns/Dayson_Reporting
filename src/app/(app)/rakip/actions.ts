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

export async function createCompetitorObservation(input: {
  competitorId: string;
  companyId?: string | null;
  visitId?: string | null;
  productName: string;
  observedPrice?: number | null;
  city?: string | null;
  note?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  if (!input.competitorId) return { error: "Rakip seçiniz." };
  if (!input.productName.trim()) return { error: "Ürün adı zorunludur." };

  const { error } = await supabase.from("competitor_observations").insert({
    competitor_id: input.competitorId,
    company_id: input.companyId || null,
    salesperson_id: user.id,
    visit_id: input.visitId || null,
    product_name: input.productName.trim(),
    observed_price: input.observedPrice ?? null,
    city: input.city?.trim() || null,
    note: input.note?.trim() || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/rakip");
  return { ok: true };
}
