import Link from "next/link";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTRDate, daysSince } from "@/lib/week";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  type CompanyKind,
} from "@/lib/enums";

type Row = {
  id: string;
  name: string;
  kind: CompanyKind;
  city: string | null;
  plate_code: string | null;
  segment: string | null;
  logo_code: string | null;
};

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { q?: string; tur?: string };
}) {
  await requireProfile();
  const supabase = createClient();
  const q = (searchParams.q ?? "").trim();
  const kind = (COMPANY_KINDS as readonly string[]).includes(searchParams.tur ?? "")
    ? (searchParams.tur as CompanyKind)
    : null;

  let query = supabase
    .from("companies")
    .select("id, name, kind, city, plate_code, segment, logo_code")
    .is("deleted_at", null)
    .order("name")
    .limit(200);
  if (kind) query = query.eq("kind", kind);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data } = await query;
  const rows = (data as Row[] | null) ?? [];

  const { data: lv } =
    rows.length > 0
      ? await supabase
          .from("company_last_visit")
          .select("company_id, last_visit_date")
          .in("company_id", rows.map((r) => r.id))
      : { data: [] as { company_id: string; last_visit_date: string | null }[] };
  const lastMap = new Map((lv ?? []).map((r) => [r.company_id, r.last_visit_date as string | null]));

  const href = (k: CompanyKind | null) =>
    `/firmalar?${new URLSearchParams({
      ...(q ? { q } : {}),
      ...(k ? { tur: k } : {}),
    }).toString()}`;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Firmalar</h1>
        <Link href="/ziyaret/yeni">
          <Button size="sm" variant="secondary">
            <Plus className="mr-1 h-4 w-4" /> Yeni firma
          </Button>
        </Link>
      </div>

      <form className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {kind && <input type="hidden" name="tur" value={kind} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Firma ara…"
          className="h-11 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
        />
      </form>

      <div className="flex flex-wrap gap-2">
        <Link
          href={href(null)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            !kind ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
          )}
        >
          Tümü
        </Link>
        {COMPANY_KINDS.map((k) => (
          <Link
            key={k}
            href={href(k)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              kind === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {COMPANY_KIND_LABELS[k]}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Firma bulunamadı.
            {kind !== "distributor" && (
              <>
                {" "}
                Yeni bir potansiyel bayi veya başka bir firmayı{" "}
                <Link href="/ziyaret/yeni" className="underline">
                  Yeni Ziyaret
                </Link>{" "}
                ekranından ekleyebilirsin.
              </>
            )}
          </p>
        ) : (
          rows.map((r) => {
            const last = lastMap.get(r.id) ?? null;
            const d = daysSince(last);
            return (
              <Link key={r.id} href={`/firma/${r.id}`}>
                <Card className="hover:bg-accent">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r.name}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline">{COMPANY_KIND_LABELS[r.kind]}</Badge>
                        {(r.plate_code || r.city) && (
                          <span>{[r.plate_code, r.city].filter(Boolean).join(" ")}</span>
                        )}
                        <span>
                          · {last ? `Son ziyaret ${formatTRDate(last)}${d != null ? ` (${d} gün)` : ""}` : "Hiç ziyaret yok"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
        {rows.length >= 200 && (
          <p className="text-center text-xs text-muted-foreground">
            İlk 200 firma gösteriliyor; daraltmak için arama yap.
          </p>
        )}
      </div>
    </div>
  );
}
