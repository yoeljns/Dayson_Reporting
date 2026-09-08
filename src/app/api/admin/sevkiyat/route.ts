import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMalzemeEkstresi } from "@/lib/sales/parse";
import { classify, nameKey } from "@/lib/sales/mapping";
import { getPalletRates } from "@/lib/settings";

export const runtime = "nodejs";

type Row = {
  cari_name: string;
  company_id: string | null;
  fis_no: string;
  fis_date: string;
  product_code: string;
  product_desc: string;
  koli: number;
  eur: number;
  sales_category_id: string | null;
  qty: number | null;
};

/**
 * Weekly shipment upload (Logo "Malzeme Ekstresi" export). The file is the
 * source of truth for its date range: existing shipments inside
 * [minDate, maxDate] are replaced, so the same YTD file can be re-uploaded
 * every week without double counting and ERP corrections flow through.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "manager")
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });

  let parsed: ReturnType<typeof parseMalzemeEkstresi>;
  try {
    parsed = parseMalzemeEkstresi(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Dosya okunamadı. Geçerli bir Excel yükleyin." }, { status: 400 });
  }
  if (parsed.rows.length === 0 || !parsed.minDate || !parsed.maxDate) {
    return NextResponse.json(
      { error: "Dosyada sevkiyat satırı bulunamadı. Logo 'Malzeme Ekstresi' (TOPLU.xlsx) formatı bekleniyor." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const rates = await getPalletRates();
  const { data: cats } = await admin.from("sales_categories").select("id, code");
  const catId = new Map(((cats as { id: string; code: string }[] | null) ?? []).map((c) => [c.code, c.id]));

  // --- Customer mapping: remembered names first, then a unique name-key match.
  const cariNames = Array.from(new Set(parsed.rows.map((r) => r.cariName)));
  const mapping = new Map<string, string | null>();
  for (let i = 0; i < cariNames.length; i += 300) {
    const { data } = await admin
      .from("erp_customers")
      .select("cari_name, company_id")
      .in("cari_name", cariNames.slice(i, i + 300));
    for (const m of (data as { cari_name: string; company_id: string | null }[] | null) ?? [])
      mapping.set(m.cari_name, m.company_id);
  }
  const unknown = cariNames.filter((n) => !mapping.has(n));
  if (unknown.length > 0) {
    const { data: companies } = await admin
      .from("companies")
      .select("id, name, kind")
      .is("deleted_at", null)
      .limit(10000);
    const byKey = new Map<string, { id: string; kind: string }[]>();
    for (const c of (companies as { id: string; name: string; kind: string }[] | null) ?? []) {
      const k = nameKey(c.name);
      if (!k) continue;
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push({ id: c.id, kind: c.kind });
    }
    const inserts: { cari_name: string; company_id: string | null; updated_by: string }[] = [];
    for (const name of unknown) {
      const cands = byKey.get(nameKey(name)) ?? [];
      const dealers = cands.filter((c) => c.kind === "distributor");
      const pick = dealers.length === 1 ? dealers[0] : cands.length === 1 ? cands[0] : null;
      mapping.set(name, pick?.id ?? null);
      inserts.push({ cari_name: name, company_id: pick?.id ?? null, updated_by: user.id });
    }
    for (let i = 0; i < inserts.length; i += 300) {
      await admin
        .from("erp_customers")
        .upsert(inserts.slice(i, i + 300), { onConflict: "cari_name", ignoreDuplicates: true });
    }
  }

  // --- Classification + in-file de-duplication (same fiş / product / customer).
  const unmappedProducts = new Map<string, string>();
  let excluded = 0;
  const merged = new Map<string, Row>();
  for (const r of parsed.rows) {
    const c = classify(r.productCode, r.productDesc, rates);
    let categoryId: string | null = null;
    let factor: number | null = null;
    if (c.kind === "mapped") {
      categoryId = catId.get(c.category) ?? null;
      factor = c.qtyPerKoli;
    } else if (c.kind === "excluded") excluded++;
    else unmappedProducts.set(r.productCode, r.productDesc);
    const qtyOf = (koli: number) =>
      factor != null && categoryId ? Math.round(koli * factor * 1000) / 1000 : null;
    const key = [r.fisNo, r.productCode, r.cariName].join("|");
    const ex = merged.get(key);
    if (ex) {
      ex.koli += r.koli;
      ex.eur += r.eur;
      ex.qty = qtyOf(ex.koli);
      continue;
    }
    merged.set(key, {
      cari_name: r.cariName,
      company_id: mapping.get(r.cariName) ?? null,
      fis_no: r.fisNo,
      fis_date: r.fisDate,
      product_code: r.productCode,
      product_desc: r.productDesc,
      koli: r.koli,
      eur: r.eur,
      sales_category_id: categoryId,
      qty: qtyOf(r.koli),
    });
  }
  const rows = Array.from(merged.values());
  const unmatched = cariNames.filter((n) => !mapping.get(n));

  // --- Batch row, then replace the file's date range.
  const { data: batch, error: batchErr } = await admin
    .from("import_batches")
    .insert({
      uploaded_by: user.id,
      filename: file.name,
      row_count: rows.length,
      status: "basarili",
      error_detail: { kind: "sevkiyat", range: [parsed.minDate, parsed.maxDate] },
    })
    .select("id")
    .single();
  if (batchErr || !batch)
    return NextResponse.json({ error: batchErr?.message ?? "Kayıt açılamadı" }, { status: 500 });

  const { error: delErr } = await admin
    .from("shipments")
    .delete()
    .gte("fis_date", parsed.minDate)
    .lte("fis_date", parsed.maxDate);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, batch_id: batch.id }));
    const { error } = await admin.from("shipments").insert(chunk);
    if (error) {
      await admin
        .from("import_batches")
        .update({
          status: "hata",
          inserted_count: inserted,
          error_detail: { kind: "sevkiyat", message: error.message },
        })
        .eq("id", batch.id);
      return NextResponse.json({ error: `Satırlar yazılamadı: ${error.message}` }, { status: 500 });
    }
    inserted += chunk.length;
  }

  const detail = {
    kind: "sevkiyat",
    range: [parsed.minDate, parsed.maxDate],
    products: parsed.products.length,
    excluded,
    unmatchedCustomers: unmatched,
    unmappedProducts: Array.from(unmappedProducts, ([code, desc]) => ({ code, desc })),
  };
  const issues = unmatched.length + unmappedProducts.size;
  await admin
    .from("import_batches")
    .update({
      inserted_count: inserted,
      updated_count: 0,
      error_count: issues,
      status: issues > 0 ? "kismi" : "basarili",
      error_detail: detail,
    })
    .eq("id", batch.id);

  revalidatePath("/admin/sevkiyat");
  revalidatePath("/admin/hedefler");
  revalidatePath("/admin");

  return NextResponse.json({
    range: [parsed.minDate, parsed.maxDate],
    rows: rows.length,
    inserted,
    products: parsed.products.length,
    excluded,
    unmatchedCustomers: unmatched,
    unmappedProducts: detail.unmappedProducts,
  });
}
