import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { importRowSchema, mapHeader } from "@/lib/import";
import type { ImportRowError } from "@/types/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // 1) Verify the caller is an admin (RLS-bypassing work follows).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  // 2) Read the uploaded file.
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let rawRows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    // Remap headers to canonical keys.
    rawRows = json.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        const canonical = mapHeader(key);
        if (canonical) mapped[canonical] = value;
      }
      return mapped;
    });
  } catch {
    return NextResponse.json(
      { error: "Dosya okunamadı. Geçerli bir Excel/CSV yükleyin." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Pre-load salesperson emails → ids for assignment resolution.
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email");
  const emailToId = new Map(
    (profiles ?? []).map((p) => [p.email.toLowerCase(), p.id])
  );

  const errors: ImportRowError[] = [];
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2; // header is row 1
    const parsed = importRowSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      errors.push({
        row: rowNum,
        logo_code: String(rawRows[i].logo_kodu ?? ""),
        message: parsed.error.issues.map((e) => e.message).join("; "),
      });
      continue;
    }
    const r = parsed.data;

    // Upsert company by logo_code.
    const { data: existing } = await admin
      .from("companies")
      .select("id")
      .eq("logo_code", r.logo_kodu)
      .maybeSingle();

    const payload = {
      kind: "distributor" as const,
      name: r.bayi_adi,
      logo_code: r.logo_kodu,
      segment: r.segment ?? null,
      debt_status: r.borc_durumu ?? null,
      city: r.sehir ?? null,
      phone: r.telefon ?? null,
      updated_at: new Date().toISOString(),
    };

    let companyId: string;
    if (existing) {
      const { error } = await admin
        .from("companies")
        .update(payload)
        .eq("id", existing.id);
      if (error) {
        errors.push({ row: rowNum, logo_code: r.logo_kodu, message: error.message });
        continue;
      }
      companyId = existing.id;
      updated++;
    } else {
      const { data, error } = await admin
        .from("companies")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        errors.push({
          row: rowNum,
          logo_code: r.logo_kodu,
          message: error?.message ?? "Eklenemedi",
        });
        continue;
      }
      companyId = data.id;
      inserted++;
    }

    // Reconcile assignment from salesperson email.
    if (r.pazarlamaci_email) {
      const spId = emailToId.get(r.pazarlamaci_email);
      if (!spId) {
        errors.push({
          row: rowNum,
          logo_code: r.logo_kodu,
          message: `Pazarlamacı bulunamadı: ${r.pazarlamaci_email}`,
        });
      } else {
        await admin.from("assignments").delete().eq("company_id", companyId);
        await admin
          .from("assignments")
          .insert({ company_id: companyId, salesperson_id: spId });
      }
    }
  }

  const status =
    errors.length === 0 ? "basarili" : inserted + updated > 0 ? "kismi" : "hata";

  await admin.from("import_batches").insert({
    uploaded_by: user.id,
    filename: file.name,
    row_count: rawRows.length,
    inserted_count: inserted,
    updated_count: updated,
    error_count: errors.length,
    status,
    error_detail: errors.length ? errors : null,
  });

  return NextResponse.json({
    status,
    rowCount: rawRows.length,
    inserted,
    updated,
    errorCount: errors.length,
    errors: errors.slice(0, 100),
  });
}
