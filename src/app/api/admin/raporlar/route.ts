import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { REPORTS, REPORT_ORDER, type ReportType } from "@/lib/reports";
import { parseFilters, todayIso } from "@/lib/reports/filters";
import {
  newWorkbook,
  appendSheet,
  workbookBuffer,
} from "@/lib/reports/sheet";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Manager/admin only. RLS client → a manager reads all rows by policy.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "manager" && profile?.role !== "admin") {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  const filters = parseFilters(url.searchParams);

  const wb = newWorkbook();
  let filenameBase = "rapor";

  if (type === "all") {
    const notes: { Bilgi: string }[] = [];
    for (const t of REPORT_ORDER) {
      const def = REPORTS[t];
      // Heavy reports (full-history scans) stay out of the combined workbook —
      // they are downloadable on their own.
      if (def.heavy) continue;
      const res = await def.build(supabase, filters);
      appendSheet(wb, res.sheetName, res.rows, res.headers);
      if (res.capped)
        notes.push({
          Bilgi: `${def.label}: ilk ${res.rows.length} kayıt gösterildi (sınır aşıldı, filtreyi daraltın).`,
        });
    }
    if (notes.length > 0) appendSheet(wb, "Bilgi", notes, ["Bilgi"]);
    filenameBase = "tum-raporlar";
  } else if (REPORT_ORDER.includes(type)) {
    const def = REPORTS[type as ReportType];
    const res = await def.build(supabase, filters);
    appendSheet(wb, res.sheetName, res.rows, res.headers);
    if (res.capped)
      appendSheet(
        wb,
        "Bilgi",
        [
          {
            Bilgi: `Sonuç ${res.rows.length} kayıtla sınırlandı. Lütfen filtreleri daraltın.`,
          },
        ],
        ["Bilgi"]
      );
    filenameBase = def.filenameBase;
  } else {
    return NextResponse.json({ error: "Geçersiz rapor türü" }, { status: 400 });
  }

  const buf = workbookBuffer(wb);
  const filename = `${filenameBase}-${todayIso()}.xlsx`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
