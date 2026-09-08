import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { formatTRDate } from "@/lib/week";
import { ExtrasList } from "@/components/extra-fields";
import { DeleteRecordButton } from "@/components/delete-record-button";
import { loadFormFields, type Extras } from "@/lib/form-fields";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComplaintStatusChanger } from "@/components/complaint-status-changer";
import { ComplaintDrawer } from "@/components/complaint-drawer";
import { PhotoGrid } from "@/components/photo-grid";
import { getPhotosFor } from "@/lib/photos/server";
import { complaintCode } from "@/lib/codes";
import { COMPLAINT_STATUS_LABELS, type ComplaintStatus } from "@/lib/enums";

const statusVariant: Record<
  ComplaintStatus,
  "warning" | "default" | "success" | "secondary"
> = {
  acik: "warning",
  islemde: "default",
  cozuldu: "success",
  iptal: "secondary",
};

type Row = {
  id: string;
  title: string;
  status: ComplaintStatus;
  detected_at: string | null;
  created_at: string;
  complainant_name: string | null;
  companies: { name: string } | { name: string }[] | null;
  reporter: { full_name: string } | { full_name: string }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const COLUMNS: { key: "acik" | "islemde" | "kapandi"; label: string; statuses: ComplaintStatus[] }[] = [
  { key: "acik", label: "Açık", statuses: ["acik"] },
  { key: "islemde", label: "İşlemde", statuses: ["islemde"] },
  { key: "kapandi", label: "Kapandı (son 30 gün)", statuses: ["cozuldu", "iptal"] },
];

export default async function ComplaintBoardPage({
  searchParams,
}: {
  searchParams: { id?: string; q?: string };
}) {
  const profile = await requireManager();
  const supabase = createClient();
  const q = (searchParams.q ?? "").trim().toLocaleLowerCase("tr");

  const { data } = await supabase
    .from("complaints")
    .select(
      "id, title, status, detected_at, created_at, complainant_name, companies(name), reporter:reported_by(full_name)"
    )
    .eq("is_draft", false)
    .order("created_at", { ascending: false })
    .limit(400);
  let rows = (data as Row[] | null) ?? [];
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  rows = rows.filter(
    (r) => r.status === "acik" || r.status === "islemde" || r.created_at >= cutoff
  );
  if (q)
    rows = rows.filter((r) =>
      [r.title, one(r.companies)?.name, r.complainant_name, one(r.reporter)?.full_name]
        .filter(Boolean)
        .some((t) => String(t).toLocaleLowerCase("tr").includes(q))
    );

  const openHref = (id: string) => {
    const sp = new URLSearchParams();
    if (searchParams.q) sp.set("q", searchParams.q);
    sp.set("id", id);
    return `/admin/sikayetler?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Şikayet Panosu</h1>
        <p className="text-sm text-muted-foreground">
          Açık → İşlemde → Kapandı. Karta dokununca ayrıntı, fotoğraflar ve
          durum değişikliği yan panelde açılır.
        </p>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Firma / kişi / açıklama ara…"
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
        />
        <button type="submit" className="rounded-md border px-3 text-sm hover:bg-accent">
          Ara
        </button>
      </form>

      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = rows.filter((r) => col.statuses.includes(r.status));
          return (
            <div key={col.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="section-label">{col.label}</span>
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Kayıt yok
                </p>
              ) : (
                list.map((c) => (
                  <Link key={c.id} href={openHref(c.id)} scroll={false}>
                    <Card className="hover:bg-accent">
                      <CardContent className="space-y-1 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium leading-snug">{c.title}</div>
                          <Badge variant={statusVariant[c.status]}>
                            {COMPLAINT_STATUS_LABELS[c.status]}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {one(c.companies)?.name || c.complainant_name || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {complaintCode(c.id)} · {one(c.reporter)?.full_name ?? "—"} ·{" "}
                          {formatTRDate((c.detected_at ?? c.created_at).slice(0, 10))}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          );
        })}
      </div>

      {searchParams.id && (
        <ComplaintDetailDrawer id={searchParams.id} canReopen={profile.role !== "salesperson"} />
      )}
    </div>
  );
}

async function ComplaintDetailDrawer({ id, canReopen }: { id: string; canReopen: boolean }) {
  const supabase = createClient();
  const [{ data: c }, { data: events }, photos, fields] = await Promise.all([
    supabase
      .from("complaints")
      .select(
        "id, status, title, description, detected_at, extras, created_at, complainant_name, complainant_phone, visit_id, company_id, companies(name), reporter:reported_by(full_name), product_categories(label_tr)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("complaint_events")
      .select("id, from_status, to_status, note, created_at, actor:actor_id(full_name)")
      .eq("complaint_id", id)
      .order("created_at", { ascending: true }),
    getPhotosFor("complaint", id),
    loadFormFields(supabase, "sikayet"),
  ]);
  if (!c) return null;
  const productLabel = one(c.product_categories as { label_tr: string } | { label_tr: string }[] | null)?.label_tr;
  const company = one(c.companies as { name: string } | { name: string }[] | null);
  const reporter = one(c.reporter as { full_name: string } | { full_name: string }[] | null);
  return (
    <ComplaintDrawer
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{complaintCode(c.id)}</span>
          <span>{c.title}</span>
          <Badge variant={statusVariant[c.status as ComplaintStatus]}>
            {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
          </Badge>
        </span>
      }
    >
      <div className="space-y-4 text-sm">
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          <Fact label="Firma" value={company?.name ?? "—"} href={c.company_id ? `/admin/bayi/${c.company_id}` : undefined} />
          <Fact label="Şikayet eden" value={c.complainant_name ?? "—"} />
          <Fact label="Telefon" value={c.complainant_phone ?? "—"} />
          <Fact label="Tespit tarihi" value={c.detected_at ? formatTRDate(c.detected_at as string) : "—"} />
          {productLabel && <Fact label="Ürün" value={productLabel} />}
          <Fact label="Bildiren" value={reporter?.full_name ?? "—"} />
          <Fact label="Açılış" value={new Date(c.created_at).toLocaleString("tr-TR")} />
          {c.visit_id && <Fact label="Ziyaret" value="Ziyarete git" href={`/ziyaret/${c.visit_id}`} />}
        </dl>
        <div>
          <div className="text-muted-foreground">Açıklama</div>
          <p className="whitespace-pre-wrap text-base leading-relaxed">{c.description}</p>
        </div>
        <ExtrasList fields={fields} extras={c.extras as Extras | null} />
        {photos.length > 0 && (
          <div>
            <div className="mb-1 text-muted-foreground">Fotoğraflar</div>
            <PhotoGrid photos={photos} canDelete />
          </div>
        )}
        <div className="rounded-md border p-3">
          <div className="mb-2 font-medium">Durum güncelle</div>
          <ComplaintStatusChanger
            complaintId={c.id}
            current={c.status as ComplaintStatus}
            canReopen={canReopen}
          />
        </div>
        <div className="flex justify-end print:hidden">
          <DeleteRecordButton kind="complaint" id={c.id} redirectTo="/admin/sikayetler" />
        </div>
        <div>
          <div className="mb-2 font-medium">Geçmiş</div>
          <div className="space-y-3">
            {(events ?? []).map((e) => {
              const actor = one(e.actor as { full_name: string } | { full_name: string }[] | null);
              return (
                <div key={e.id} className="border-l-2 border-muted pl-3">
                  <div className="font-medium">
                    {e.from_status
                      ? `${COMPLAINT_STATUS_LABELS[e.from_status as ComplaintStatus]} → ${COMPLAINT_STATUS_LABELS[e.to_status as ComplaintStatus]}`
                      : COMPLAINT_STATUS_LABELS[e.to_status as ComplaintStatus]}
                  </div>
                  {e.note && <p className="whitespace-pre-wrap">{e.note}</p>}
                  <div className="text-xs text-muted-foreground">
                    {actor?.full_name} · {new Date(e.created_at).toLocaleString("tr-TR")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ComplaintDrawer>
  );
}

function Fact({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1 last:border-0 sm:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">
        {href ? (
          <Link href={href} className="underline">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

