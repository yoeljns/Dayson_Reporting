import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComplaintStatusChanger } from "@/components/complaint-status-changer";
import { RecordPhotos } from "@/components/visit-photos";
import { getPhotosFor } from "@/lib/photos/server";
import { complaintCode } from "@/lib/codes";
import { COMPLAINT_STATUS_LABELS, type ComplaintStatus } from "@/lib/enums";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { ExtrasList } from "@/components/extra-fields";
import { loadFormFields, type Extras } from "@/lib/form-fields";
import { formatTRDate } from "@/lib/week";

const statusVariant: Record<
  ComplaintStatus,
  "warning" | "default" | "success" | "secondary"
> = {
  acik: "warning",
  islemde: "default",
  cozuldu: "success",
  iptal: "secondary",
};

export default async function ComplaintDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: c } = await supabase
    .from("complaints")
    .select(
      "id, status, title, description, detected_at, extras, product_category_id, created_at, is_draft, complainant_name, complainant_phone, reported_by, companies(name), reporter:reported_by(full_name), product_categories(label_tr)"
    )
    .eq("id", params.id)
    .single();

  // Drafts have no timeline/status yet — they are resumed from the form instead.
  if (!c || c.is_draft) notFound();

  const [{ data: events }, photos, fields] = await Promise.all([
    supabase
      .from("complaint_events")
      .select("id, from_status, to_status, note, created_at, actor:actor_id(full_name)")
      .eq("complaint_id", params.id)
      .order("created_at", { ascending: true }),
    getPhotosFor("complaint", params.id),
    loadFormFields(supabase, "sikayet"),
  ]);
  const isOwner = c.reported_by === profile.id;
  const productLabel = (Array.isArray(c.product_categories)
    ? c.product_categories[0]
    : (c.product_categories as { label_tr: string } | null))?.label_tr;
  const canEditPhotos =
    c.reported_by === profile.id || profile.role !== "salesperson";

  const company = Array.isArray(c.companies)
    ? c.companies[0]
    : (c.companies as { name: string } | null);
  const reporter = Array.isArray(c.reporter)
    ? c.reporter[0]
    : (c.reporter as { full_name: string } | null);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">{c.title}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-xs">{complaintCode(c.id)}</span>
            {" · "}
            {c.complainant_name || company?.name || "—"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={statusVariant[c.status as ComplaintStatus]}>
            {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
          </Badge>
          {(isOwner || profile.role !== "salesperson") && (
            <div className="flex items-center gap-1 print:hidden">
              {isOwner && (
                <Link href={`/sikayet/yeni?edit=${c.id}`}>
                  <Button variant="outline" size="sm">
                    <Pencil className="mr-1 h-4 w-4" /> Düzenle
                  </Button>
                </Link>
              )}
              <DeleteRecordButton kind="complaint" id={c.id} redirectTo="/sikayetler" />
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4 text-sm">
          <Row label="Tespit tarihi" value={c.detected_at ? formatTRDate(c.detected_at as string) : "—"} />
          {productLabel && <Row label="Ürün" value={productLabel} />}
          <Row label="Şikayet eden" value={c.complainant_name ?? "—"} />
          <Row label="Telefon" value={c.complainant_phone ?? "—"} />
          <Row label="Bağlı distribütör" value={company?.name ?? "—"} />
          <Row label="Bildiren (pazarlamacı)" value={reporter?.full_name ?? "—"} />
          <div className="pt-2">
            <div className="text-muted-foreground">Açıklama</div>
            <p className="whitespace-pre-wrap">{c.description}</p>
          </div>
          <ExtrasList fields={fields} extras={c.extras as Extras | null} className="pt-2" />
          <div className="pt-2">
            <RecordPhotos
              refTable="complaint"
              refId={c.id}
              photos={photos}
              canEdit={canEditPhotos}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Durum Güncelle</CardTitle>
        </CardHeader>
        <CardContent>
          <ComplaintStatusChanger
            complaintId={c.id}
            current={c.status as ComplaintStatus}
            canReopen={profile.role !== "salesperson"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Geçmiş</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(events ?? []).map((e) => {
            const actor = Array.isArray(e.actor)
              ? e.actor[0]
              : (e.actor as { full_name: string } | null);
            return (
              <div key={e.id} className="border-l-2 border-muted pl-3">
                <div className="text-sm font-medium">
                  {e.from_status
                    ? `${COMPLAINT_STATUS_LABELS[e.from_status as ComplaintStatus]} → ${COMPLAINT_STATUS_LABELS[e.to_status as ComplaintStatus]}`
                    : COMPLAINT_STATUS_LABELS[e.to_status as ComplaintStatus]}
                </div>
                {e.note && <p className="text-sm">{e.note}</p>}
                <div className="text-xs text-muted-foreground">
                  {actor?.full_name} ·{" "}
                  {new Date(e.created_at).toLocaleString("tr-TR")}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
