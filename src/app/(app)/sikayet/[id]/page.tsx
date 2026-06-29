import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComplaintStatusChanger } from "@/components/complaint-status-changer";
import {
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_OWNER_DEPT_LABELS,
  COMPLAINT_PRIORITY_LABELS,
  type ComplaintStatus,
} from "@/lib/enums";

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
  await requireProfile();
  const supabase = createClient();

  const { data: c } = await supabase
    .from("complaints")
    .select(
      "id, type, owner_dept, status, title, description, priority, due_date, created_at, complainant_name, complainant_phone, companies(name), reporter:reported_by(full_name)"
    )
    .eq("id", params.id)
    .single();

  if (!c) notFound();

  const { data: events } = await supabase
    .from("complaint_events")
    .select("id, from_status, to_status, note, created_at, actor:actor_id(full_name)")
    .eq("complaint_id", params.id)
    .order("created_at", { ascending: true });

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
            {c.complainant_name || company?.name || "—"}
          </p>
        </div>
        <Badge variant={statusVariant[c.status as ComplaintStatus]}>
          {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
        </Badge>
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4 text-sm">
          <Row
            label="Tip"
            value={COMPLAINT_TYPE_LABELS[c.type as keyof typeof COMPLAINT_TYPE_LABELS]}
          />
          <Row
            label="Departman"
            value={
              COMPLAINT_OWNER_DEPT_LABELS[
                c.owner_dept as keyof typeof COMPLAINT_OWNER_DEPT_LABELS
              ]
            }
          />
          <Row
            label="Öncelik"
            value={COMPLAINT_PRIORITY_LABELS[c.priority] ?? String(c.priority)}
          />
          <Row label="Termin" value={c.due_date ?? "—"} />
          <Row label="Şikayet eden" value={c.complainant_name ?? "—"} />
          <Row label="Telefon" value={c.complainant_phone ?? "—"} />
          <Row label="Bağlı distribütör" value={company?.name ?? "—"} />
          <Row label="Bildiren (pazarlamacı)" value={reporter?.full_name ?? "—"} />
          <div className="pt-2">
            <div className="text-muted-foreground">Açıklama</div>
            <p className="whitespace-pre-wrap">{c.description}</p>
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
