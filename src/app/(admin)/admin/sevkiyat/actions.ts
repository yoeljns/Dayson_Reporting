"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classify, normalizeRates, type PalletRates } from "@/lib/sales/mapping";

function revalidate() {
  revalidatePath("/admin/sevkiyat");
  revalidatePath("/admin/hedefler");
  revalidatePath("/admin");
}

/** Remember which company an ERP customer name belongs to; re-links its shipments. */
export async function mapErpCustomer(input: {
  cariName: string;
  companyId: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  const profile = await requireManager();
  const cariName = input.cariName.trim();
  if (!cariName) return { error: "Müşteri adı boş." };
  const supabase = createClient();
  const { error } = await supabase.from("erp_customers").upsert(
    {
      cari_name: cariName,
      company_id: input.companyId || null,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cari_name" }
  );
  if (error) return { error: error.message };
  const { error: shipErr } = await supabase
    .from("shipments")
    .update({ company_id: input.companyId || null })
    .eq("cari_name", cariName);
  if (shipErr) return { error: shipErr.message };
  revalidate();
  return { ok: true };
}

/**
 * Save koli → palet rates and re-classify every product's shipment lines so
 * pallet quantities follow the new rates immediately.
 */
export async function savePalletRates(input: Partial<PalletRates>): Promise<{ ok?: boolean; error?: string; products?: number }> {
  const profile = await requireManager();
  const rates = normalizeRates(input);
  const admin = createAdminClient();
  const { error } = await admin.from("app_settings").upsert(
    { key: "koli_per_pallet", value: rates, updated_by: profile.id, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) return { error: error.message };
  const n = await reclassifyShipments(rates);
  revalidate();
  return { ok: true, products: n };
}

/** Re-run product → category mapping for all shipment lines (mapping fixes). */
export async function reclassifyAll(): Promise<{ ok?: boolean; error?: string; products?: number }> {
  await requireManager();
  const admin = createAdminClient();
  const { data } = await admin.from("app_settings").select("value").eq("key", "koli_per_pallet").maybeSingle();
  const n = await reclassifyShipments(normalizeRates(data?.value ?? null));
  revalidate();
  return { ok: true, products: n };
}

async function reclassifyShipments(rates: PalletRates): Promise<number> {
  const admin = createAdminClient();
  const { data: cats } = await admin.from("sales_categories").select("id, code");
  const catId = new Map(((cats as { id: string; code: string }[] | null) ?? []).map((c) => [c.code, c.id]));
  const products = new Map<string, string>();
  for (let from = 0; ; from += 5000) {
    const { data } = await admin
      .from("shipments")
      .select("product_code, product_desc")
      .range(from, from + 4999);
    const rows = (data as { product_code: string; product_desc: string | null }[] | null) ?? [];
    for (const r of rows) if (!products.has(r.product_code)) products.set(r.product_code, r.product_desc ?? "");
    if (rows.length < 5000) break;
  }
  for (const [code, desc] of products) {
    const c = classify(code, desc, rates);
    const category = c.kind === "mapped" ? (catId.get(c.category) ?? null) : null;
    const factor = c.kind === "mapped" && category ? c.qtyPerKoli : null;
    await admin.rpc("set_shipment_qty", { p_code: code, p_category: category, p_factor: factor });
  }
  return products.size;
}
