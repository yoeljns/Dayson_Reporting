"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
