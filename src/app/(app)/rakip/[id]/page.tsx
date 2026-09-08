import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Swords } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordPhotos } from "@/components/visit-photos";
import { ExtrasList } from "@/components/extra-fields";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { getPhotosFor } from "@/lib/photos/server";
import { loadFormFields, type Extras } from "@/lib/form-fields";
import { formatTRDate } from "@/lib/week";
import { formatTRY } from "@/lib/utils";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const vatLabel = (v: boolean | null | undefined) =>
  v === true ? "KDV dahil" : v === false ? "KDV hariç" : "KDV bilinmiyor";

export default async function ObservationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { return?: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();
  const { data: o } = await supabase
    .from("competitor_observations")
    .select(
      "id, salesperson_id, is_draft, product_name, observed_price, price_includes_vat, currency, observed_at, city, note, extras, visit_id, company_id, competitor_id, competitor_product_id, created_at, competitors(name), companies(name), salesperson:salesperson_id(full_name)"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!o) notFound();
  const [photos, fields] = await Promise.all([
    getPhotosFor("competitor_observation", o.id),
    loadFormFields(supabase, "rakip"),
  ]);
  const isOwner = o.salesperson_id === profile.id;
  const canDelete = isOwner || profile.role !== "salesperson";
  const comp = one(o.competitors as { name: string } | { name: string }[] | null);
  const co = one(o.companies as { name: string } | { name: string }[] | null);
  const sp = one(o.salesperson as { full_name: string } | { full_name: string }[] | null);
  const back = searchParams.return || "/rakip";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href={back} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {searchParams.return ? "Geri" : "Rakip bilgileri"}
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Swords className="h-5 w-5 text-primary" />
            {comp?.name ?? "Rakip"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {o.product_name}
            {o.competitor_product_id ? "" : " · serbest"}
            {" · "}
            {formatTRDate(o.observed_at as string)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {o.is_draft && <Badge variant="secondary">Taslak</Badge>}
          <div className="flex items-center gap-1 print:hidden">
            {isOwner && (
              <Link href={`/rakip/yeni?${o.is_draft ? "draft" : "edit"}=${o.id}`}>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-1 h-4 w-4" /> Düzenle
                </Button>
              </Link>
            )}
            {canDelete && <DeleteRecordButton kind="observation" id={o.id} redirectTo="/rakip" />}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4 text-sm">
          <Row label="Fiyat" value={o.observed_price != null ? `${formatTRY(o.observed_price)} · ${vatLabel(o.price_includes_vat as boolean | null)}` : "—"} />
          <Row label="Şehir" value={(o.city as string | null) ?? "—"} />
          <Row label="Nerede görüldü" value={co?.name ?? "—"} />
          <Row label="Kaydeden" value={sp?.full_name ?? "—"} />
          {o.visit_id && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Ziyaret</span>
              <Link href={`/ziyaret/${o.visit_id}`} className="font-medium underline">
                Ziyarete git
              </Link>
            </div>
          )}
          {o.note && (
            <div className="pt-2">
              <div className="text-muted-foreground">Not</div>
              <p className="whitespace-pre-wrap">{o.note}</p>
            </div>
          )}
          <ExtrasList fields={fields} extras={o.extras as Extras | null} className="pt-2" />
          <div className="pt-2">
            <RecordPhotos
              refTable="competitor_observation"
              refId={o.id}
              photos={photos}
              canEdit={isOwner}
              title="Fotoğraf / fiyat listesi"
              allowPdf
            />
          </div>
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
