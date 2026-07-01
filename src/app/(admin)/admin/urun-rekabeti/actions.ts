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

/** Rename a category. Safe for history: reports resolve label_tr at query time. */
export async function renameProductCategory(input: {
  categoryId: string;
  labelTr: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const labelTr = input.labelTr.trim();
  if (!labelTr) return { error: "Kategori adı zorunludur." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("product_categories")
    .update({ label_tr: labelTr })
    .eq("id", input.categoryId);
  if (error) return { error: error.message };
  revalidatePath("/admin/urun-rekabeti");
  return { ok: true };
}

/**
 * Move a category up/down in the wizard order. The whole list is renumbered
 * (10, 20, 30…) after the swap so duplicate sort_order values can never make
 * a move a silent no-op.
 */
export async function moveProductCategory(input: {
  categoryId: string;
  direction: "up" | "down";
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: cats, error: qErr } = await admin
    .from("product_categories")
    .select("id, sort_order")
    .order("sort_order")
    .order("id");
  if (qErr) return { error: qErr.message };

  const order = (cats ?? []).map((c) => c.id as string);
  const i = order.indexOf(input.categoryId);
  if (i < 0) return { error: "Kategori bulunamadı." };
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= order.length) return { ok: true }; // already at the edge
  [order[i], order[j]] = [order[j], order[i]];

  for (let k = 0; k < order.length; k++) {
    const { error } = await admin
      .from("product_categories")
      .update({ sort_order: (k + 1) * 10 })
      .eq("id", order[k]);
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/urun-rekabeti");
  return { ok: true };
}

/** Activate/deactivate a brand globally (affects every category it appears in). */
export async function setBrandActive(input: {
  brandId: string;
  isActive: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("product_brands")
    .update({ is_active: input.isActive })
    .eq("id", input.brandId);
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
  const findBrand = async () =>
    (
      await admin
        .from("product_brands")
        .select("id, is_active")
        .ilike("name", name)
        .limit(1)
        .maybeSingle()
    ).data as { id: string; is_active: boolean } | null;

  // Re-adding a deactivated brand revives it. Without this the (invisible)
  // link would exist and every retry would dead-end on "already linked".
  let reactivated = false;
  const existing = await findBrand();
  if (existing && !existing.is_active) {
    const { error: aErr } = await admin
      .from("product_brands")
      .update({ is_active: true })
      .eq("id", existing.id);
    if (aErr) return { error: aErr.message };
    reactivated = true;
  }

  let brandId = existing?.id;
  if (!brandId) {
    const { data: created, error: bErr } = await admin
      .from("product_brands")
      .insert({ name })
      .select("id")
      .single();
    if (created) brandId = created.id;
    else {
      brandId = (await findBrand())?.id; // lost the unique(lower(name)) race
      if (!brandId) return { error: bErr?.message ?? "Marka eklenemedi." };
    }
  }

  // Already linked globally?
  const { data: link } = await admin
    .from("product_category_brands")
    .select("id")
    .eq("category_id", input.categoryId)
    .eq("brand_id", brandId)
    .is("salesperson_id", null)
    .maybeSingle();
  if (link) {
    if (reactivated) {
      // The link existed but the brand was hidden — reviving it is the fix.
      revalidatePath("/admin/urun-rekabeti");
      return { ok: true };
    }
    return { error: "Bu marka zaten ekli." };
  }

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
