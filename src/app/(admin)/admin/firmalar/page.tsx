import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssignmentEditor } from "@/components/assignment-editor";
import { CompanyRowEditor } from "@/components/company-row-editor";
import { CompanyFilterBar } from "@/components/company-filter-bar";
import { cn } from "@/lib/utils";
import { formatTRDate, daysSince } from "@/lib/week";
import {
  COMPANY_SORTS,
  VISIT_AGES,
  listCompanies,
  listQueryString,
  parseKind,
  parseListParams,
  parseSegment,
  parseSort,
  parseVisitAge,
  withQuery,
  type CompanyListParams,
} from "@/lib/companies/list";
import { COMPANY_KINDS, COMPANY_KIND_LABELS, SEGMENTS } from "@/lib/enums";

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireManager();
  const admin = createAdminClient();
  const params = parseListParams(searchParams);
  const kind = parseKind(params.tur);
  const unassignedOnly = params.atama === "yok";
  const segment = parseSegment(params.segment);
  const visitAge = parseVisitAge(params.ziyaret);
  const sort = parseSort(params.sirala);

  const [rows, { data: profiles }, { data: all }] = await Promise.all([
    listCompanies(admin, params, 500),
    admin.from("profiles").select("id, full_name, role, is_active"),
    admin.from("companies").select("kind, plate_code, city").is("deleted_at", null),
  ]);
  const salespeople = ((profiles as { id: string; full_name: string; role: string; is_active: boolean }[] | null) ?? [])
    .filter((p) => p.role === "salesperson" && p.is_active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"));
  const nameOf = new Map(((profiles as { id: string; full_name: string }[] | null) ?? []).map((p) => [p.id, p.full_name]));

  // Kind counts + region options (plate → most common city; cities without a plate).
  const kindCounts = new Map<string, number>();
  const plateCity = new Map<string, Map<string, number>>();
  const cityOnly = new Map<string, number>();
  for (const c of (all as { kind: string; plate_code: string | null; city: string | null }[] | null) ?? []) {
    kindCounts.set(c.kind, (kindCounts.get(c.kind) ?? 0) + 1);
    if (c.plate_code) {
      const m = plateCity.get(c.plate_code) ?? plateCity.set(c.plate_code, new Map()).get(c.plate_code)!;
      const city = (c.city ?? "").trim();
      m.set(city, (m.get(city) ?? 0) + 1);
    } else if (c.city?.trim()) {
      const city = c.city.trim();
      cityOnly.set(city, (cityOnly.get(city) ?? 0) + 1);
    }
  }
  const regions = [
    ...Array.from(plateCity.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([plate, cities]) => {
        const city = Array.from(cities.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
        const n = Array.from(cities.values()).reduce((a, b) => a + b, 0);
        return { value: plate, label: `${plate} ${city}`.trim() + ` (${n})` };
      }),
    ...Array.from(cityOnly.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "tr"))
      .map(([city, n]) => ({ value: city, label: `${city} (${n})` })),
  ];

  const href = (patch: Partial<CompanyListParams>) =>
    withQuery("/admin/firmalar", listQueryString({ ...params, ...patch }));
  const navQs = listQueryString(params);
  const activeFilters = [
    params.sp ? `pazarlamacı: ${nameOf.get(params.sp) ?? "?"}` : null,
    params.bolge ? `bölge: ${params.bolge}` : null,
    segment ? `segment ${segment}` : null,
    visitAge ? `son ziyaret ${VISIT_AGES.find((a) => a.key === visitAge)?.label}` : null,
    unassignedOnly ? "atanmamış" : null,
    kind ? COMPANY_KIND_LABELS[kind] : null,
    params.q ? `"${params.q}"` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Firmalar</h1>
          <p className="text-sm text-muted-foreground">
            Bayiler, potansiyel bayiler ve diğer firmalar. Satırdan pazarlamacı
            ataması, tür, plaka ve &quot;üzerinden aldığı bayi&quot; düzenlenir; bir
            firma tek tıkla bayiye dönüştürülür.
          </p>
        </div>
        <Link href="/admin/bayiler">
          <Button variant="outline" size="sm">
            Bayi ekle / Excel
          </Button>
        </Link>
      </div>

      <CompanyFilterBar
        salespeople={salespeople}
        regions={regions}
        initial={{ q: params.q ?? "", sp: params.sp ?? "", bolge: params.bolge ?? "", sirala: sort }}
      />

      <div className="flex flex-wrap gap-2">
        <Chip href={href({ tur: null })} active={!kind}>
          Tümü ({all?.length ?? 0})
        </Chip>
        {COMPANY_KINDS.map((k) => (
          <Chip key={k} href={href({ tur: k })} active={kind === k}>
            {COMPANY_KIND_LABELS[k]} ({kindCounts.get(k) ?? 0})
          </Chip>
        ))}
        <Chip href={href({ atama: unassignedOnly ? null : "yok" })} active={unassignedOnly}>
          Atanmamış
        </Chip>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Segment:</span>
        {SEGMENTS.map((s) => (
          <Chip key={s} href={href({ segment: segment === s ? null : s })} active={segment === s} small>
            {s}
          </Chip>
        ))}
        <span className="ml-2 text-muted-foreground">Son ziyaret:</span>
        {VISIT_AGES.map((a) => (
          <Chip key={a.key} href={href({ ziyaret: visitAge === a.key ? null : a.key })} active={visitAge === a.key} small>
            {a.label}
          </Chip>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {rows.length} firma
        {activeFilters.length > 0 ? ` · ${activeFilters.join(" · ")}` : ""}
        {" · sıralama: "}
        {COMPANY_SORTS.find((s) => s.key === sort)?.label.toLocaleLowerCase("tr")}
        {activeFilters.length > 0 && (
          <>
            {" · "}
            <Link href={withQuery("/admin/firmalar", listQueryString({ sirala: sort }))} className="underline">
              Süzgeçleri temizle
            </Link>
          </>
        )}
      </p>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Firma bulunamadı.</p>
        ) : (
          rows.map((r) => {
            const d = daysSince(r.lastVisit);
            return (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={withQuery(`/admin/bayi/${r.id}`, navQs)} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <Badge variant="outline">{COMPANY_KIND_LABELS[r.kind]}</Badge>
                      {r.segment && <Badge variant="secondary">Segment {r.segment}</Badge>}
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
                      {r.lastVisit
                        ? `son ziyaret ${formatTRDate(r.lastVisit)}${d != null ? ` (${d} gün)` : ""}`
                        : "hiç ziyaret yok"}
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

function Chip({
  href,
  active,
  small = false,
  children,
}: {
  href: string;
  active: boolean;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border",
        small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      {children}
    </Link>
  );
}
