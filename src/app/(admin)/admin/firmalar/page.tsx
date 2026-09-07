import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssignmentEditor } from "@/components/assignment-editor";
import { CompanyRowEditor, type CompanyRowData } from "@/components/company-row-editor";
import { groupAssignments } from "@/lib/assignments";
import { cn } from "@/lib/utils";
import { formatTRDate, daysSince } from "@/lib/week";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  type CompanyKind,
} from "@/lib/enums";

type Row = CompanyRowData & {
  logo_code: string | null;
  created_by: string | null;
  created_at: string;
  buys_from: { name: string } | { name: string }[] | null;
};

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: { q?: string; tur?: string; atama?: string };
}) {
  await requireManager();
  const admin = createAdminClient();
  const q = (searchParams.q ?? "").trim();
  const kind = (COMPANY_KINDS as readonly string[]).includes(searchParams.tur ?? "")
    ? (searchParams.tur as CompanyKind)
    : null;
  const unassignedOnly = searchParams.atama === "yok";

  let query = admin
    .from("companies")
    .select(
      "id, name, kind, city, plate_code, phone, logo_code, buys_from_company_id, created_by, created_at, buys_from:buys_from_company_id(name)"
    )
    .is("deleted_at", null)
    .order("name")
    .limit(500);
  if (kind) query = query.eq("kind", kind);
  if (q) query = query.ilike("name", `%${q}%`);

  const [{ data }, { data: assignments }, { data: profiles }, { data: counts }] =
    await Promise.all([
      query,
      admin.from("assignments").select("company_id, salesperson_id, role"),
      admin.from("profiles").select("id, full_name, role, is_active"),
      admin.from("companies").select("kind").is("deleted_at", null),
    ]);
  const assignMap = groupAssignments(assignments);
  const salespeople = ((profiles as { id: string; full_name: string; role: string; is_active: boolean }[] | null) ?? [])
    .filter((p) => p.role === "salesperson" && p.is_active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"));
  const nameOf = new Map(((profiles as { id: string; full_name: string }[] | null) ?? []).map((p) => [p.id, p.full_name]));

  let rows = ((data as unknown as Row[] | null) ?? []).map((r) => ({
    ...r,
    buysFromName: (Array.isArray(r.buys_from) ? r.buys_from[0] : r.buys_from)?.name ?? null,
    reps: assignMap.get(r.id),
  }));
  if (unassignedOnly) rows = rows.filter((r) => !r.reps || (!r.reps.owner && r.reps.backups.length === 0));

  const { data: lv } =
    rows.length > 0
      ? await admin
          .from("company_last_visit")
          .select("company_id, last_visit_date")
          .in("company_id", rows.map((r) => r.id))
      : { data: [] as { company_id: string; last_visit_date: string | null }[] };
  const lastMap = new Map((lv ?? []).map((r) => [r.company_id, r.last_visit_date as string | null]));

  const kindCounts = new Map<string, number>();
  for (const c of counts ?? []) kindCounts.set(c.kind, (kindCounts.get(c.kind) ?? 0) + 1);

  const href = (next: { tur?: CompanyKind | null; atama?: boolean }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const k = next.tur === undefined ? kind : next.tur;
    if (k) sp.set("tur", k);
    const a = next.atama === undefined ? unassignedOnly : next.atama;
    if (a) sp.set("atama", "yok");
    const s = sp.toString();
    return s ? `/admin/firmalar?${s}` : "/admin/firmalar";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Firmalar</h1>
          <p className="text-sm text-muted-foreground">
            Bayiler, sahadan eklenen potansiyel bayiler, alt bayiler ve rakip
            noktaları. Satırdan pazarlamacı ataması, tür, plaka ve &quot;üzerinden
            aldığı bayi&quot; düzenlenir; potansiyel bayi tek tıkla bayiye dönüştürülür.
          </p>
        </div>
        <Link href="/admin/bayiler">
          <Button variant="outline" size="sm">
            Bayi ekle / Excel
          </Button>
        </Link>
      </div>

      <form className="flex gap-2">
        {kind && <input type="hidden" name="tur" value={kind} />}
        {unassignedOnly && <input type="hidden" name="atama" value="yok" />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Firma ara…"
          className="h-9 w-full max-w-sm rounded-md border bg-background px-3 text-sm"
        />
        <Button type="submit" variant="secondary" size="sm">
          Ara
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Chip href={href({ tur: null })} active={!kind}>
          Tümü ({counts?.length ?? 0})
        </Chip>
        {COMPANY_KINDS.map((k) => (
          <Chip key={k} href={href({ tur: k })} active={kind === k}>
            {COMPANY_KIND_LABELS[k]} ({kindCounts.get(k) ?? 0})
          </Chip>
        ))}
        <Chip href={href({ atama: !unassignedOnly })} active={unassignedOnly}>
          Atanmamış
        </Chip>
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Firma bulunamadı.</p>
        ) : (
          rows.map((r) => {
            const last = lastMap.get(r.id) ?? null;
            const d = daysSince(last);
            return (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/admin/bayi/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <Badge variant="outline">{COMPANY_KIND_LABELS[r.kind]}</Badge>
                      {r.kind !== "distributor" && r.created_by && (
                        <span className="text-xs text-muted-foreground">
                          sahadan · {nameOf.get(r.created_by) ?? "—"} · {formatTRDate(r.created_at.slice(0, 10))}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[r.logo_code, [r.plate_code, r.city].filter(Boolean).join(" "), r.phone]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                      {r.buysFromName ? ` · ${r.buysFromName} üzerinden alıyor` : ""}
                      {" · "}
                      {last ? `son ziyaret ${formatTRDate(last)}${d != null ? ` (${d} gün)` : ""}` : "hiç ziyaret yok"}
                    </div>
                    <div className="mt-1.5">
                      <AssignmentEditor
                        companyId={r.id}
                        owner={r.reps?.owner ?? null}
                        backups={r.reps?.backups ?? []}
                        salespeople={salespeople}
                        compact
                      />
                    </div>
                  </div>
                  <CompanyRowEditor
                    company={{
                      id: r.id,
                      name: r.name,
                      kind: r.kind,
                      city: r.city,
                      plate_code: r.plate_code,
                      phone: r.phone,
                      buys_from_company_id: r.buys_from_company_id,
                      buysFromName: r.buysFromName,
                    }}
                  />
                </CardContent>
              </Card>
            );
          })
        )}
        {rows.length >= 500 && (
          <p className="text-center text-xs text-muted-foreground">İlk 500 firma gösteriliyor.</p>
        )}
      </div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-sm",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      {children}
    </Link>
  );
}
