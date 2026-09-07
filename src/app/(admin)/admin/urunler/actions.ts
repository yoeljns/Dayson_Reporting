"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function revalidate() {
  revalidatePath("/admin/urunler");
  revalidatePath("/admin/stok");
  revalidatePath("/stok/yeni");
}

/** Create or update an SKU (ürün). Code is the stable key for Excel/reports. */
export async function upsertSku(input: {
  id?: string | null;
  code: string;
  nameTr: string;
  categoryId?: string | null;
  unitsPerBox?: number | null;
  inStockCount: boolean;
  isActive?: boolean;
}): Promise<{ id?: string; error?: string }> {
  await requireAdmin();
  const code = input.code.trim().toUpperCase();
  const name = input.nameTr.trim();
  if (!/^[A-Z0-9_\-.]+$/.test(code))
    return { error: "Ürün kodu harf, rakam, - _ . içerebilir." };
  if (!name) return { error: "Ürün adı zorunludur." };
  const units =
    input.unitsPerBox == null || input.unitsPerBox === 0
      ? null
      : Math.max(1, Math.round(Number(input.unitsPerBox)));
  const admin = createAdminClient();
  const row = {
    code,
    name_tr: name,
    category_id: input.categoryId || null,
    units_per_box: units,
    in_stock_count: input.inStockCount,
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
  };
  if (input.id) {
    const { error } = await admin.from("skus").update(row).eq("id", input.id);
    if (error) return { error: error.code === "23505" ? "Bu kod zaten kullanımda." : error.message };
    revalidate();
    return { id: input.id };
  }
  const { data: maxRow } = await admin
    .from("skus")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await admin
    .from("skus")
    .insert({ ...row, sort_order: (maxRow?.sort_order ?? 0) + 10 })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "Bu kod zaten kullanımda." : error.message };
  revalidate();
  return { id: data.id };
}

/** Quick toggles from the list. */
export async function patchSku(input: {
  id: string;
  inStockCount?: boolean;
  isActive?: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const patch: Record<string, unknown> = {};
  if (input.inStockCount !== undefined) patch.in_stock_count = input.inStockCount;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  const admin = createAdminClient();
  const { error } = await admin.from("skus").update(patch).eq("id", input.id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function reorderSku(input: {
  id: string;
  direction: "up" | "down";
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("skus")
    .select("id, sort_order")
    .order("sort_order")
    .order("created_at");
  const list = (data ?? []) as { id: string; sort_order: number }[];
  const i = list.findIndex((q) => q.id === input.id);
  const j = input.direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  const ladder = list.map((q, idx) => ({ id: q.id, sort_order: (idx + 1) * 10 }));
  const tmp = ladder[i].sort_order;
  ladder[i].sort_order = ladder[j].sort_order;
  ladder[j].sort_order = tmp;
  for (const row of ladder) {
    const { error } = await admin.from("skus").update({ sort_order: row.sort_order }).eq("id", row.id);
    if (error) return { error: error.message };
  }
  revalidate();
  return { ok: true };
}

/** Delete an SKU that was never counted; otherwise deactivate it. */
export async function deleteSku(input: {
  id: string;
}): Promise<{ ok?: boolean; deactivated?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("skus").delete().eq("id", input.id);
  if (error) {
    const { error: e2 } = await admin
      .from("skus")
      .update({ is_active: false, in_stock_count: false })
      .eq("id", input.id);
    if (e2) return { error: e2.message };
    revalidate();
    return { ok: true, deactivated: true };
  }
  revalidate();
  return { ok: true };
}
