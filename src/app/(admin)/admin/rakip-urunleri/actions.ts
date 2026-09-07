"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function revalidate() {
  revalidatePath("/admin/rakip-urunleri");
  revalidatePath("/admin/rakip-haritasi");
  revalidatePath("/rakip/yeni");
}

/** Map a free-text observation onto a catalog product (or create one). */
export async function mapObservationProduct(input: {
  observationId: string;
  competitorProductId?: string | null;
  /** When set (and no id), a new catalog product with this name is created. */
  newName?: string | null;
  categoryId?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const profile = await requireManager();
  const admin = createAdminClient();
  const { data: obs } = await admin
    .from("competitor_observations")
    .select("id, competitor_id, product_name")
    .eq("id", input.observationId)
    .maybeSingle();
  if (!obs) return { error: "Kayıt bulunamadı." };
  if (!obs.competitor_id) return { error: "Kaydın rakibi yok." };

  let productId = input.competitorProductId || null;
  let productName: string | null = null;
  if (!productId) {
    const name = (input.newName ?? obs.product_name ?? "").trim();
    if (!name) return { error: "Ürün adı gerekli." };
    const { data: existing } = await admin
      .from("competitor_products")
      .select("id, name")
      .eq("competitor_id", obs.competitor_id)
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (existing) {
      productId = existing.id;
      productName = existing.name;
    } else {
      const { data: created, error } = await admin
        .from("competitor_products")
        .insert({
          competitor_id: obs.competitor_id,
          name,
          category_id: input.categoryId || null,
          created_by: profile.id,
        })
        .select("id, name")
        .single();
      if (error) return { error: error.message };
      productId = created.id;
      productName = created.name;
    }
  } else {
    const { data: p } = await admin
      .from("competitor_products")
      .select("name")
      .eq("id", productId)
      .maybeSingle();
    productName = p?.name ?? null;
  }
  const { error } = await admin
    .from("competitor_observations")
    .update({
      competitor_product_id: productId,
      ...(productName ? { product_name: productName } : {}),
    })
    .eq("id", input.observationId);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function upsertCompetitorProduct(input: {
  id?: string | null;
  competitorId: string;
  name: string;
  categoryId?: string | null;
  isActive?: boolean;
}): Promise<{ id?: string; error?: string }> {
  const profile = await requireAdmin();
  const name = input.name.trim();
  if (!name) return { error: "Ürün adı zorunludur." };
  const admin = createAdminClient();
  if (input.id) {
    const { error } = await admin
      .from("competitor_products")
      .update({
        name,
        category_id: input.categoryId || null,
        ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
      })
      .eq("id", input.id);
    if (error) return { error: error.code === "23505" ? "Bu rakipte aynı adlı ürün var." : error.message };
    revalidate();
    return { id: input.id };
  }
  const { data, error } = await admin
    .from("competitor_products")
    .insert({
      competitor_id: input.competitorId,
      name,
      category_id: input.categoryId || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "Bu rakipte aynı adlı ürün var." : error.message };
  revalidate();
  return { id: data.id };
}

export async function deleteCompetitorProduct(input: {
  id: string;
}): Promise<{ ok?: boolean; deactivated?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("competitor_products").delete().eq("id", input.id);
  if (error) {
    const { error: e2 } = await admin
      .from("competitor_products")
      .update({ is_active: false })
      .eq("id", input.id);
    if (e2) return { error: e2.message };
    revalidate();
    return { ok: true, deactivated: true };
  }
  revalidate();
  return { ok: true };
}
