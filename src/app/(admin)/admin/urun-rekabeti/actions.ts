"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function addProductCategory(input: {
  code: string;
  labelTr: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const code = input.code.trim();
  if (!/^[a-z0-9_]+$/.test(code))
    return { error: "Kod yalnızca küçük harf, rakam ve _ içerebilir." };
  if (!input.labelTr.trim()) return { error: "Kategori adı zorunludur." };

  const admin = createAdminClient();
  const { data: maxRow } = await admin
    .from("product_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 10;

  const { error } = await admin
    .from("product_categories")
    .insert({ code, label_tr: input.labelTr.trim(), sort_order: nextOrder });
  if (error) return { error: error.message };
  revalidatePath("/admin/urun-rekabeti");
  return { ok: true };
}

export async function toggleProductCategory(input: {
  categoryId: string;
  isActive: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("product_categories")
    .update({ is_active: input.isActive })
    .eq("id", input.categoryId);
  if (error) return { error: error.message };
  revalidatePath("/admin/urun-rekabeti");
  return { ok: true };
}

/** Add a brand (find-or-create) as a GLOBAL option for a category. */
export async function addBrandLink(input: {
  categoryId: string;
  name: string;
  isOwn: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) return { error: "Marka adı zorunludur." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("product_brands")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  let brandId = existing?.id;
  if (!brandId) {
    const { data: created, error: bErr } = await admin
      .from("product_brands")
      .insert({ name })
      .select("id")
      .single();
    if (bErr || !created) return { error: bErr?.message ?? "Marka eklenemedi." };
    brandId = created.id;
  }

  // Already linked globally?
  const { data: link } = await admin
    .from("product_category_brands")
    .select("id")
    .eq("category_id", input.categoryId)
    .eq("brand_id", brandId)
    .is("salesperson_id", null)
    .maybeSingle();
  if (link) return { error: "Bu marka zaten ekli." };

  const { data: maxRow } = await admin
    .from("product_category_brands")
    .select("sort_order")
    .eq("category_id", input.categoryId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { error } = await admin.from("product_category_brands").insert({
    category_id: input.categoryId,
    brand_id: brandId,
    is_own: input.isOwn,
    sort_order: nextOrder,
    salesperson_id: null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/urun-rekabeti");
  return { ok: true };
}

export async function removeBrandLink(input: {
  linkId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("product_category_brands")
    .delete()
    .eq("id", input.linkId);
  if (error) return { error: error.message };
  revalidatePath("/admin/urun-rekabeti");
  return { ok: true };
}

export async function toggleBrandOwn(input: {
  linkId: string;
  isOwn: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("product_category_brands")
    .update({ is_own: input.isOwn })
    .eq("id", input.linkId);
  if (error) return { error: error.message };
  revalidatePath("/admin/urun-rekabeti");
  return { ok: true };
}
