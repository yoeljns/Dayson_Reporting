import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShipmentUpload } from "@/components/shipment-upload";
import { ErpCustomerMap, type MatchedCustomer, type UnmatchedCustomer } from "@/components/erp-customer-map";
import { PalletRatesForm } from "@/components/pallet-rates-form";
import { getPalletRates } from "@/lib/settings";
import { nameKey } from "@/lib/sales/mapping";
import { fmtEur } from "@/lib/rules/target";
import { IMPORT_STATUS_LABELS, type ImportStatus } from "@/lib/enums";
import { formatTRDate, todayIso } from "@/lib/week";

type BatchDetail = {
  kind?: string;
  range?: [string, string];
  products?: number;
  excluded?: number;
  unmatchedCustomers?: string[];
  unmappedProducts?: { code: string; desc: string }[];
  message?: string;
};

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function ShipmentsPage() {
  await requireManager();
  const supabase = createClient();
  const year = Number(todayIso().slice(0, 4));

  const [rates, batchesRes, erpRes, orphanRes, countRes, latestRes, companiesRes] = await Promise.all([
    getPalletRates(),
    supabase
      .from("import_batches")
      .select("id, filename, row_count, inserted_count, error_count, status, error_detail, created_at, profiles:uploaded_by(full_name)")
      .contains("error_detail", { kind: "sevkiyat" })
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("erp_customers")
      .select("cari_name, company_id, companies(id, name)")
      .order("cari_name")
      .limit(3000),
    supabase.from("shipments").select("cari_name, koli, eur").is("company_id", null).limit(20000),
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .gte("fis_date", `${year}-01-01`),
    supabase.from("shipments").select("fis_date").order("fis_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("companies").select("id, name, kind").is("deleted_at", null).limit(10000),
  ]);

  // Suggestions for unmatched names: unique name-key hit among companies.
  const byKey = new Map<string, { id: string; name: string; kind: string }[]>();
  for (const c of (companiesRes.data as { id: string; name: string; kind: string }[] | null) ?? []) {
    const k = nameKey(c.name);
    if (k) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(c);
  }
  const suggest = (name: string) => {
    const cands = byKey.get(nameKey(name)) ?? [];
    const dealers = cands.filter((c) => c.kind === "distributor");
    const pick = dealers[0] ?? cands[0] ?? null;
    return pick ? { id: pick.id, name: pick.name } : null;
  };

  const orphanTotals = new Map<string, { koli: number; eur: number }>();
  for (const r of (orphanRes.data as { cari_name: string; koli: number; eur: number }[] | null) ?? []) {
    const t = orphanTotals.get(r.cari_name) ?? { koli: 0, eur: 0 };
    t.koli += Number(r.koli);
    t.eur += Number(r.eur);
    orphanTotals.set(r.cari_name, t);
  }

  const unmatched: UnmatchedCustomer[] = [];
  const matched: MatchedCustomer[] = [];
  const seen = new Set<string>();
  for (const e of (erpRes.data as unknown as {
    cari_name: string;
    company_id: string | null;
    companies: { id: string; name: string } | { id: string; name: string }[] | null;
  }[] | null) ?? []) {
    seen.add(e.cari_name);
    const co = one(e.companies);
    if (e.company_id && co) matched.push({ cariName: e.cari_name, company: { id: co.id, name: co.name } });
    else {
      const t = orphanTotals.get(e.cari_name) ?? { koli: 0, eur: 0 };
      unmatched.push({ cariName: e.cari_name, koli: t.koli, eur: t.eur, suggestion: suggest(e.cari_name) });
    }
  }
  for (const [name, t] of orphanTotals) {
    if (seen.has(name)) continue;
    unmatched.push({ cariName: name, koli: t.koli, eur: t.eur, suggestion: suggest(name) });
  }
  unmatched.sort((a, b) => b.eur - a.eur);

  const batches = ((batchesRes.data as unknown as {
    id: string;
    filename: string;
    row_count: number | null;
    inserted_count: number | null;
    error_count: number | null;
    status: ImportStatus;
    error_detail: BatchDetail | null;
    created_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }[] | null) ?? []).map((b) => ({ ...b, by: one(b.profiles)?.full_name ?? null }));
  const lastDetail = batches[0]?.error_detail ?? null;
  const rowCount = countRes.count ?? 0;
  const latestDate = (latestRes.data?.fis_date as string | null | undefined) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sevkiyat</h1>
        <p className="text-sm text-muted-foreground">
          Haftalık toplu çıkış dosyası. {year} yılı: {rowCount.toLocaleString("tr-TR")} sevkiyat satırı
          {latestDate ? `, son sevkiyat ${formatTRDate(latestDate)}` : ""}.{" "}
          <Link href="/admin/hedefler" className="underline">
            Hedefler
          </Link>
        </p>
      </div>

      <ShipmentUpload />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Müşteri eşleme</CardTitle>
        </CardHeader>
        <CardContent>
          <ErpCustomerMap unmatched={unmatched} matched={matched} />
        </CardContent>
      </Card>

      {lastDetail?.unmappedProducts && lastDetail.unmappedProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kategoriye eşlenemeyen ürün kodları</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-sm text-muted-foreground">
              Bu ürünlerin sevkiyatı hedeften düşmez. Ürün kodu deseni yazılıma eklenmeli.
            </p>
            <ul className="space-y-1 text-sm">
              {lastDetail.unmappedProducts.map((p) => (
                <li key={p.code}>
                  <span className="font-mono text-xs">{p.code}</span> — {p.desc}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dönüşüm oranları (koli / palet)</CardTitle>
        </CardHeader>
        <CardContent>
          <PalletRatesForm rates={rates} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Son yüklemeler</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz yükleme yok.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <div className="font-medium">{b.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(b.created_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}
                      {b.by ? ` · ${b.by}` : ""}
                      {b.error_detail?.range
                        ? ` · ${formatTRDate(b.error_detail.range[0])} – ${formatTRDate(b.error_detail.range[1])}`
                        : ""}
                      {` · ${b.inserted_count ?? b.row_count ?? 0} satır`}
                      {b.error_detail?.unmatchedCustomers?.length
                        ? ` · ${b.error_detail.unmatchedCustomers.length} eşleşmeyen müşteri`
                        : ""}
                      {b.error_detail?.message ? ` · ${b.error_detail.message}` : ""}
                    </div>
                  </div>
                  <Badge variant={b.status === "basarili" ? "success" : b.status === "kismi" ? "warning" : "destructive"}>
                    {IMPORT_STATUS_LABELS[b.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {unmatched.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Eşleşmeyen müşterilerin sevkiyatı ({fmtEur(unmatched.reduce((a, u) => a + u.eur, 0))}) hiçbir bayiye
              yazılmaz; eşlendiğinde otomatik bağlanır.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
