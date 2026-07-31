import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VisitRecord, type VisitRecordProduct } from "@/components/visit-record";
import { PrintButton } from "@/components/print-button";
import { ExpandAll } from "@/components/expand-all";
import { analyzeBrandSwitch } from "@/lib/analytics/brand-switch";
import { formatTRY, cn } from "@/lib/utils";
import { formatTRDate, daysSince, todayIso } from "@/lib/week";
import {
  VISIT_TYPE_LABELS,
  COMPANY_KIND_LABELS,
  DEBT_STATUS_LABELS,
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  type ComplaintStatus,
  type ComplaintType,
  type DebtStatus,
  type VisitType,
  type VisitStatus,
  type SupplyKind,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer } from "@/types/db";

const HISTORY_LIMIT = 40;

const statusVariant: Record<
  ComplaintStatus,
  "warning" | "default" | "success" | "secondary"
> = {
  acik: "warning",
  islemde: "default",
  cozuldu: "success",
  iptal: "secondary",
};

function one<T>(r: T | T[] | null | undefined): T | null {
  return Array.isArray(r) ? r[0] ?? null : r ?? null;
}

export default async function DealerFilePage({
  params,
}: {
  params: { id: string };
}) {
  await requireManager();
  const supabase = createClient();
  const companyId = params.id;

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, kind, logo_code, segment, debt_status, city, phone, notes, deleted_at"
    )
    .eq("id", companyId)
    .maybeSingle();
  if (!company || company.deleted_at) notFound();

  const [
    { data: visitRows },
    { data: assignRows },
    { data: contacts },
    { data: complaints },
    { data: observations },
    { data: questionRows },
    { data: cats },
    { data: lastVisitRow },
    brand,
  ] = await Promise.all([
    supabase
      .from("visits")
      .select(
        "id, visit_date, visit_type, status, salesperson_id, contact_id, salesperson:salesperson_id(full_name), contact:contact_id(name, role)"
      )
      .eq("company_id", companyId)
      .eq("status", "tamamlandi")
      .is("deleted_at", null)
      .order("visit_date", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("assignments")
      .select("salesperson_id, profiles:salesperson_id(full_name)")
      .eq("company_id", companyId),
    supabase
      .from("company_contacts")
      .select("id, name, phone, role")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false }),
    supabase
      .from("complaints")
      .select(
        "id, title, description, type, status, priority, due_date, resolved_at, created_at"
      )
      .eq("company_id", companyId)
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("competitor_observations")
      .select(
        "id, product_name, observed_price, currency, observed_at, note, competitors(name)"
      )
      .eq("company_id", companyId)
      .eq("is_draft", false)
      .order("observed_at", { ascending: false })
      .limit(50),
    supabase
      .from("questions")
      .select("*, question_options(*)")
      .order("sort_order"),
    supabase.from("product_categories").select("id, label_tr"),
    // Real lifetime totals — the visit list below is only the newest page.
    supabase
      .from("company_last_visit")
      .select("last_visit_date, visit_count")
      .eq("company_id", companyId)
      .maybeSingle(),
    analyzeBrandSwitch(supabase, "2000-01-01", todayIso(), {
      companyIds: [companyId],
    }),
  ]);

  type VisitRow = {
    id: string;
    visit_date: string;
    visit_type: VisitType;
    status: VisitStatus;
    salesperson: { full_name: string } | { full_name: string }[] | null;
    contact: { name: string; role: string | null } | { name: string; role: string | null }[] | null;
  };
  const visits = (visitRows ?? []) as VisitRow[];
  const visitIds = visits.map((v) => v.id);

  // Answers + products for every visit shown (one round trip each).
  const [{ data: answerRows }, { data: productRows }, { data: brandRows }] =
    await Promise.all([
      visitIds.length
        ? supabase.from("visit_answers").select("*").in("visit_id", visitIds)
        : Promise.resolve({ data: [] as VisitAnswer[] }),
      visitIds.length
        ? supabase
            .from("visit_product_answers")
            .select("visit_id, category_id, brand_id, supply_kind")
            .in("visit_id", visitIds)
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.from("product_brands").select("id, name"),
    ]);

  const questions = (questionRows ?? []) as QuestionWithOptions[];
  const answersByVisit = new Map<string, VisitAnswer[]>();
  for (const a of (answerRows ?? []) as VisitAnswer[]) {
    const arr = answersByVisit.get(a.visit_id) ?? [];
    arr.push(a);
    answersByVisit.set(a.visit_id, arr);
  }
  const catLabel = new Map(
    ((cats ?? []) as { id: string; label_tr: string }[]).map((c) => [
      c.id,
      c.label_tr,
    ])
  );
  const brandName = new Map(
    ((brandRows ?? []) as { id: string; name: string }[]).map((b) => [
      b.id,
      b.name,
    ])
  );
  const productsByVisit = new Map<string, VisitRecordProduct[]>();
  for (const p of (productRows ?? []) as {
    visit_id: string;
    category_id: string;
    brand_id: string | null;
    supply_kind: SupplyKind;
  }[]) {
    const arr = productsByVisit.get(p.visit_id) ?? [];
    arr.push({
      categoryLabel: catLabel.get(p.category_id) ?? "—",
      brandLabel: (p.brand_id && brandName.get(p.brand_id)) || "—",
      supplyKind: p.supply_kind,
    });
    productsByVisit.set(p.visit_id, arr);
  }

  const toRecord = (v: VisitRow) => ({
    id: v.id,
    visitDate: v.visit_date,
    visitType: v.visit_type,
    status: v.status,
    salesperson: one(v.salesperson)?.full_name ?? null,
    contactName: one(v.contact)?.name ?? null,
    contactRole: one(v.contact)?.role ?? null,
    questions,
    answers: answersByVisit.get(v.id) ?? [],
    products: productsByVisit.get(v.id) ?? [],
  });

  const reps = ((assignRows ?? []) as {
    salesperson_id: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }[])
    .map((a) => ({
      id: a.salesperson_id,
      name: one(a.profiles)?.full_name ?? "—",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const last = visits[0];
  const older = visits.slice(1);
  const lastGap = last ? daysSince(last.visit_date) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 text-[15px] leading-relaxed sm:text-base">
      <Link
        href="/admin/son-ziyaretler"
        className="inline-block text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        ← Bayiler
      </Link>

      {/* Künye */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{company.name}</h1>
              <p className="text-muted-foreground">
                {COMPANY_KIND_LABELS[company.kind as keyof typeof COMPANY_KIND_LABELS]}
                {company.city ? ` · ${company.city}` : ""}
                {company.logo_code ? ` · ${company.logo_code}` : ""}
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <a
                href={`/api/admin/raporlar?type=ziyaret&company=${companyId}&start=2000-01-01&end=${todayIso()}`}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                <Download className="h-4 w-4" />
                Excel
              </a>
              <PrintButton />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {company.segment && (
              <Badge variant="secondary">Segment {company.segment}</Badge>
            )}
            {company.debt_status && (
              <Badge
                variant={
                  company.debt_status === "temiz" ? "success" : "destructive"
                }
              >
                {DEBT_STATUS_LABELS[company.debt_status as DebtStatus]}
              </Badge>
            )}
          </div>

          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Fact label="Telefon" value={company.phone || "—"} />
            <Fact
              label="Sorumlu pazarlamacı"
              value={
                reps.length === 0
                  ? "Atanmamış"
                  : reps.map((r) => r.name).join(", ")
              }
            />
            <Fact
              label="Son ziyaret"
              value={
                last
                  ? `${formatTRDate(last.visit_date)}${
                      lastGap != null ? ` (${lastGap} gün önce)` : ""
                    }`
                  : "Hiç ziyaret edilmemiş"
              }
            />
            <Fact
              label="Toplam ziyaret"
              value={String(
                (lastVisitRow as { visit_count?: number } | null)?.visit_count ??
                  visits.length
              )}
            />
          </dl>

          {company.notes && (
            <div>
              <div className="text-sm text-muted-foreground">Firma notu</div>
              <p className="whitespace-pre-wrap">{company.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Son ziyaret — açık ve tam */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Son ziyaret notları</h2>
        {!last ? (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              Bu bayiye ait tamamlanmış ziyaret yok.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-5">
              <VisitRecord visit={toRecord(last)} />
            </CardContent>
          </Card>
        )}
      </section>

      {/* Ürün / marka durumu */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ürün / marka durumu</h2>
        {brand.share.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              Bu bayide ürün bilgisi kaydedilmemiş.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-2 pt-5">
              <ul className="space-y-1.5">
                {brand.share.map((s) => (
                  <li key={s.categoryLabel} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{s.categoryLabel}:</span>
                    {s.oursDealers > 0 ? (
                      <span className="text-green-700">Bizim markamız</span>
                    ) : (
                      <span>
                        {s.topCompetitors.map((c) => c.name).join(", ") ||
                          "Rakip"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {brand.transitions.length > 0 && (
                <div className="pt-2">
                  <div className="text-sm text-muted-foreground">
                    Marka değişimleri
                  </div>
                  <ul className="space-y-1">
                    {brand.transitions.map((t, i) => (
                      <li key={`${t.date}-${i}`}>
                        <span className="text-muted-foreground">
                          {formatTRDate(t.date)}
                        </span>{" "}
                        <span className="font-medium">{t.categoryLabel}</span>{" "}
                        <span
                          className={cn(
                            "font-medium",
                            t.won ? "text-green-700" : "text-destructive"
                          )}
                        >
                          {t.won ? "kazanım" : "kayıp"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          ({t.fromLabel} → {t.toLabel})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Geçmiş ziyaretler */}
      <section className="space-y-2" id="gecmis-ziyaretler">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Önceki ziyaretler ({older.length}
            {visits.length >= HISTORY_LIMIT ? ` — en yeni ${HISTORY_LIMIT}` : ""})
          </h2>
          {older.length > 0 && <ExpandAll targetId="gecmis-ziyaretler" />}
        </div>
        {older.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              Daha eski ziyaret yok.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {older.map((v) => (
              <Card key={v.id}>
                <CardContent className="p-0">
                  <details className="group">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 p-4 hover:bg-accent">
                      <span className="font-semibold">
                        {formatTRDate(v.visit_date)}
                      </span>
                      <span className="text-muted-foreground">
                        {VISIT_TYPE_LABELS[v.visit_type]}
                      </span>
                      <span className="text-muted-foreground">
                        {one(v.salesperson)?.full_name ?? ""}
                      </span>
                      <span className="ml-auto text-sm text-primary group-open:hidden">
                        Aç
                      </span>
                    </summary>
                    <div className="border-t p-4">
                      <VisitRecord visit={toRecord(v)} showHeader={false} />
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Şikayetler */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Şikayetler</h2>
        {!complaints || complaints.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              Bu bayiye ait şikayet yok.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {complaints.map((c) => (
              <Card key={c.id}>
                <CardContent className="space-y-1 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link
                      href={`/sikayet/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.title}
                    </Link>
                    <Badge variant={statusVariant[c.status as ComplaintStatus]}>
                      {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {COMPLAINT_TYPE_LABELS[c.type as ComplaintType]} ·{" "}
                    {formatTRDate(c.created_at.slice(0, 10))}
                    {c.due_date ? ` · Termin: ${formatTRDate(c.due_date)}` : ""}
                  </p>
                  {c.description && (
                    <p className="whitespace-pre-wrap">{c.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Kişiler + rakip fiyatlar */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Görüşülen kişiler</CardTitle>
          </CardHeader>
          <CardContent>
            {!contacts || contacts.length === 0 ? (
              <p className="text-muted-foreground">Kayıtlı kişi yok.</p>
            ) : (
              <ul className="space-y-2">
                {contacts.map((k) => (
                  <li key={k.id}>
                    <div className="font-medium">{k.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {[k.role, k.phone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rakip fiyat gözlemleri</CardTitle>
          </CardHeader>
          <CardContent>
            {!observations || observations.length === 0 ? (
              <p className="text-muted-foreground">Gözlem yok.</p>
            ) : (
              <ul className="space-y-2">
                {observations.map((o) => (
                  <li key={o.id}>
                    <div className="font-medium">
                      {
                        one(o.competitors as unknown as { name: string } | null)
                          ?.name
                      }{" "}
                      —{" "}
                      {o.product_name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {o.observed_price != null
                        ? formatTRY(o.observed_price)
                        : "Fiyat yok"}
                      {o.observed_at
                        ? ` · ${formatTRDate(o.observed_at.slice(0, 10))}`
                        : ""}
                    </div>
                    {o.note && <p className="whitespace-pre-wrap">{o.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
