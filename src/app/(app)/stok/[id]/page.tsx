import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Boxes, Pencil } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecordPhotos } from "@/components/visit-photos";
import { ExtrasList } from "@/components/extra-fields";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { getPhotosFor } from "@/lib/photos/server";
import { labelOf, loadFormFields, type Extras } from "@/lib/form-fields";
import { fmtPallet } from "@/lib/stock/server";
import { stockCountCode } from "@/lib/codes";
import { formatTRDate } from "@/lib/week";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

type LineRow = {
  sku_id: string;
  pallets: number;
  skus: { code: string; name_tr: string; sort_order: number } | { code: string; name_tr: string; sort_order: number }[] | null;
};

/** One stock count: lines, total, note, extras, photos; owner edits, owner/manager deletes. */
export default async function StockCountDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { return?: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();
  const { data: sc } = await supabase
    .from("stock_counts")
    .select(
      "id, salesperson_id, company_id, visit_id, counted_at, note, extras, created_at, companies(name), salesperson:salesperson_id(full_name), stock_count_lines(sku_id, pallets, skus(code, name_tr, sort_order))"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!sc) notFound();
  const [photos, fields] = await Promise.all([
    getPhotosFor("stock_count", sc.id),
    loadFormFields(supabase, "stok"),
  ]);
  const isOwner = sc.salesperson_id === profile.id;
  const isManager = profile.role !== "salesperson";
  const co = one(sc.companies as { name: string } | { name: string }[] | null);
  const sp = one(sc.salesperson as { full_name: string } | { full_name: string }[] | null);
  const lines = ((sc.stock_count_lines as LineRow[] | null) ?? [])
    .map((l) => {
      const s = one(l.skus);
      return {
        skuId: l.sku_id,
        pallets: Number(l.pallets),
        code: s?.code ?? "—",
        name: s?.name_tr ?? "Ürün",
        sort: s?.sort_order ?? 0,
      };
    })
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code, "tr"));
  const total = lines.reduce((a, l) => a + l.pallets, 0);
  const home = isOwner || !isManager ? `/firma/${sc.company_id}?tab=stok` : `/admin/bayi/${sc.company_id}`;
  const back = searchParams.return || home;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {searchParams.return ? "Geri" : "Bayi"}
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Boxes className="h-5 w-5 text-primary" />
            Stok Sayımı
          </h1>
          <p className="text-sm text-muted-foreground">
            {stockCountCode(sc.id)} · {formatTRDate(sc.counted_at as string)}
          </p>
        </div>
        <div className="flex items-center gap-1 print:hidden">
          {isOwner && (
            <Link href={`/stok/yeni?edit=${sc.id}`}>
              <Button variant="outline" size="sm">
                <Pencil className="mr-1 h-4 w-4" /> Düzenle
              </Button>
            </Link>
          )}
          {(isOwner || isManager) && <DeleteRecordButton kind="stock" id={sc.id} redirectTo={home} />}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{labelOf(fields, "company", "Bayi")}</span>
            <Link href={home} className="text-right font-medium underline-offset-2 hover:underline">
              {co?.name ?? "—"}
            </Link>
          </div>
          <Row label="Sayan" value={sp?.full_name ?? "—"} />
          {sc.visit_id && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Ziyaret</span>
              <Link href={`/ziyaret/${sc.visit_id}`} className="font-medium underline">
                Ziyarete git
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <div className="section-label mb-2">{labelOf(fields, "lines", "Palet sayımı")}</div>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Satır yok.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2">Kod</th>
                  <th className="py-1.5 pr-2">Ürün</th>
                  <th className="py-1.5 text-right">Palet</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.skuId} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 font-mono text-xs">{l.code}</td>
                    <td className="py-1.5 pr-2">{l.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtPallet(l.pallets)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="pt-2 text-muted-foreground">
                    Toplam palet
                  </td>
                  <td className="pt-2 text-right font-semibold tabular-nums">{fmtPallet(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-4 text-sm">
          {sc.note && (
            <div>
              <div className="text-muted-foreground">{labelOf(fields, "note", "Not")}</div>
              <p className="whitespace-pre-wrap">{sc.note}</p>
            </div>
          )}
          <ExtrasList fields={fields} extras={sc.extras as Extras | null} />
          <RecordPhotos
            refTable="stock_count"
            refId={sc.id}
            photos={photos}
            canEdit={isOwner}
            title={labelOf(fields, "photos", "Fotoğraf (depo / raf)")}
          />
          {!sc.note && photos.length === 0 && !isOwner && (
            <p className="text-muted-foreground">Not veya fotoğraf yok.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
