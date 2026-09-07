import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { todayIso, daysSince, formatTRDate } from "@/lib/week";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ComplaintStatusChanger } from "@/components/complaint-status-changer";
import { ComplaintDrawer } from "@/components/complaint-drawer";
import { PhotoGrid } from "@/components/photo-grid";
import { getPhotosFor } from "@/lib/photos/server";
import { complaintCode } from "@/lib/codes";
import { cn } from "@/lib/utils";
import {
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_OWNER_DEPT_LABELS,
  COMPLAINT_PRIORITY_LABELS,
  COMPLAINT_OWNER_DEPTS,
  type ComplaintStatus,
  type ComplaintOwnerDept,
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

type Row = {
  id: string;
  title: string;
  type: string;
  status: ComplaintStatus;
  owner_dept: string;
  priority: number;
  due_date: string | null;
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
  searchParams: { dept?: string; overdue?: string; id?: string };
}) {
  const profile = await requireManager();
  const supabase = createClient();
  const today = todayIso();
  const dept = COMPLAINT_OWNER_DEPTS.includes(searchParams.dept as ComplaintOwnerDept)
    ? (searchParams.dept as ComplaintOwnerDept)
    : undefined;
  const overdue = searchParams.overdue === "1";

  let query = supabase
    .from("complaints")
    .select(
      "id, title, type, status, owner_dept, priority, due_date, created_at, complainant_name, companies(name), reporter:reported_by(full_name)"
    )
    .eq("is_draft", false)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(400);
  if (dept) query = query.eq("owner_dept", dept);
  const { data } = await query;
  let rows = (data as Row[] | null) ?? [];
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  rows = rows.filter(
    (r) => r.status === "acik" || r.status === "islemde" || r.created_at >= cutoff
  );
  if (overdue)
    rows = rows.filter(
      (r) => (r.status === "acik" || r.status === "islemde") && r.due_date != null && r.due_date < today
    );

  const href = (next: { dept?: string | null; overdue?: boolean }) => {
    const sp = new URLSearchParams();
    const d = next.dept === undefined ? dept : next.dept;
    const o = next.overdue === undefined ? overdue : next.overdue;
    if (d) sp.set("dept", d);
    if (o) sp.set("overdue", "1");
    const s = sp.toString();
    return s ? `/admin/sikayetler?${s}` : "/admin/sikayetler";
  };
  const openHref = (id: string) => {
    const sp = new URLSearchParams();
    if (dept) sp.set("dept", dept);
    if (overdue) sp.set("overdue", "1");
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

      <div className="flex flex-wrap gap-2">
        <Chip href={href({ dept: null, overdue: false })} active={!dept && !overdue}>
          Tümü
        </Chip>
        <Chip href={href({ overdue: !overdue })} active={overdue}>
          Gecikenler
        </Chip>
        <span className="mx-1 h-6 w-px bg-border" />
        {COMPLAINT_OWNER_DEPTS.map((d) => (
          <Chip key={d} href={href({ dept: dept === d ? null : d })} active={dept === d}>
            {COMPLAINT_OWNER_DEPT_LABELS[d]}
          </Chip>
        ))}
      </div>

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
                list.map((c) => {
                  const isOverdue =
                    c.due_date != null &&
                    c.due_date < today &&
                    (c.status === "acik" || c.status === "islemde");
                  return (
                    <Link key={c.id} href={openHref(c.id)} scroll={false}>
                      <Card className={cn("hover:bg-accent", isOverdue && "border-destructive/40")}>
                        <CardContent className="space-y-1 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium leading-snug">{c.title}</div>
                            {isOverdue ? (
                              <Badge variant="destructive">{daysSince(c.due_date) ?? 0} gün gecikti</Badge>
                            ) : (
                              <Badge variant={statusVariant[c.status]}>
                                {COMPLAINT_STATUS_LABELS[c.status]}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {one(c.companies)?.name || c.complainant_name || "—"} ·{" "}
                            {COMPLAINT_OWNER_DEPT_LABELS[c.owner_dept as ComplaintOwnerDept]}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {complaintCode(c.id)} · {COMPLAINT_PRIORITY_LABELS[c.priority]} ·{" "}
                            {one(c.reporter)?.full_name ?? "—"}
                            {c.due_date ? ` · termin ${formatTRDate(c.due_date)}` : ""}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })
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
  const [{ data: c }, { data: events }, photos] = await Promise.all([
    supabase
      .from("complaints")
      .select(
        "id, type, owner_dept, status, title, description, priority, due_date, created_at, complainant_name, complainant_phone, visit_id, company_id, companies(name), reporter:reported_by(full_name)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("complaint_events")
      .select("id, from_status, to_status, note, created_at, actor:actor_id(full_name)")
      .eq("complaint_id", id)
      .order("created_at", { ascending: true }),
    getPhotosFor("complaint", id),
  ]);
  if (!c) return null;
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
          <Fact label="Tip" value={COMPLAINT_TYPE_LABELS[c.type as keyof typeof COMPLAINT_TYPE_LABELS]} />
          <Fact label="Departman" value={COMPLAINT_OWNER_DEPT_LABELS[c.owner_dept as ComplaintOwnerDept]} />
          <Fact label="Öncelik" value={COMPLAINT_PRIORITY_LABELS[c.priority] ?? String(c.priority)} />
          <Fact label="Termin" value={c.due_date ? formatTRDate(c.due_date) : "—"} />
          <Fact label="Bildiren" value={reporter?.full_name ?? "—"} />
          <Fact label="Açılış" value={new Date(c.created_at).toLocaleString("tr-TR")} />
          {c.visit_id && <Fact label="Ziyaret" value="Ziyarete git" href={`/ziyaret/${c.visit_id}`} />}
        </dl>
        <div>
          <div className="text-muted-foreground">Açıklama</div>
          <p className="whitespace-pre-wrap text-base leading-relaxed">{c.description}</p>
        </div>
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

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      {children}
    </Link>
  );
}
