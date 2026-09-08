import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Swords, Plus, Boxes, ClipboardList } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { stockCountCode } from "@/lib/codes";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { VisitWizard } from "@/components/visit-wizard";
import { VisitRecord } from "@/components/visit-record";
import { DeleteVisitButton } from "@/components/delete-visit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTRY, cn } from "@/lib/utils";
import {
  VISIT_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  COMPANY_KIND_LABELS,
  COMPLAINT_STATUS_LABELS,
  type ComplaintStatus,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer, CompanyContact } from "@/types/db";
import { SUPPLY_KIND_LABELS, type CompanyKind, type VisitType } from "@/lib/enums";
import { applicableQuestions } from "@/lib/visit-questions";
import { visitCode } from "@/lib/codes";
import { getPhotosFor } from "@/lib/photos/server";
import { surveyMatches } from "@/lib/rules/survey";
import { getTargetFor } from "@/lib/targets/server";
import { elapsedFractionOfYear, paceOf, sumLines, fmtEur } from "@/lib/rules/target";
import { getPaceThresholds } from "@/lib/settings";
import { todayIso, formatTRDate } from "@/lib/week";
import { VisitDateEditor } from "@/components/visit-date-editor";
import type { Survey } from "@/types/db";
import { RecordPhotos } from "@/components/visit-photos";

const statusVariant: Record<
  ComplaintStatus,
  "warning" | "default" | "success" | "secondary"
> = {
  acik: "warning",
  islemde: "default",
  cozuldu: "success",
  iptal: "secondary",
};

export default async function VisitDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data: visit } = await supabase
    .from("visits")
    .select(
      "id, visit_type, status, visit_date, contact_id, salesperson_id, companies(id, name, kind, city, segment, debt_status), salesperson:salesperson_id(full_name), contact:contact_id(name, role)"
    )
    .eq("id", params.id)
    .single();

  if (!visit) notFound();
  const isOwner = visit.salesperson_id === profile.id;

  const company = Array.isArray(visit.companies)
    ? visit.companies[0]
    : (visit.companies as {
        id: string;
        name: string;
        kind: CompanyKind;
        city: string | null;
        segment: string | null;
        debt_status: string | null;
      } | null);

  const [photos, { data: activeSurveys }, { data: companyPlate }] = await Promise.all([
    getPhotosFor("visit", visit.id),
    isOwner
      ? supabase.from("surveys").select("*").eq("status", "aktif")
      : Promise.resolve({ data: [] as Survey[] }),
    company
      ? supabase.from("companies").select("plate_code").eq("id", company.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const canEditPhotos = isOwner || profile.role !== "salesperson";

  // "Hedefin gerisinde" nudge on the next-action step (dealers only).
  const stepHints: Partial<Record<string, string>> = {};
  if (isOwner && company?.kind === "distributor") {
    const today = todayIso();
    const year = Number(today.slice(0, 4));
    const [target, thresholds] = await Promise.all([
      getTargetFor(supabase, company.id, year),
      getPaceThresholds(),
    ]);
    if (target && target.status !== "iptal" && target.lines.length > 0) {
      const tot = sumLines(target.lines);
      const pace = paceOf(tot.actual_eur, tot.target_eur, elapsedFractionOfYear(year, today), thresholds);
      if (pace.pace === "geride")
        stepHints.sonraki_aksiyon = `Hedefin gerisinde: ${year} hedefi ${fmtEur(
          tot.target_eur
        )}, gerçekleşen ${fmtEur(tot.actual_eur)} (beklenenin ${fmtEur(
          pace.gap
        )} altında). Aksiyonu buna göre seç.`;
    }
  }
  const [{ data: stockCounts }, { data: surveyAnswers }] = await Promise.all([
    supabase
      .from("stock_counts")
      .select("id, counted_at, note, stock_count_lines(pallets)")
      .eq("visit_id", visit.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("survey_answers")
      .select("id, answered_at, survey_id, surveys(name)")
      .eq("visit_id", visit.id)
      .order("created_at", { ascending: false }),
  ]);
  const addonSurveys = ((activeSurveys as Survey[] | null) ?? [])
    .filter((s) =>
      surveyMatches(s, {
        kind: company?.kind ?? null,
        plate: (companyPlate as { plate_code: string | null } | null)?.plate_code ?? null,
        repId: profile.id,
        date: visit.visit_date as string,
      })
    )
    .map((s) => ({ id: s.id, name: s.name }));

  const [
    { data: questions },
    { data: answers },
    { data: complaints },
    { data: observations },
    { data: cats },
    { data: pcb },
    { data: products },
    { data: allCats },
    { data: allBrands },
    { data: contacts },
  ] = await Promise.all([
    // All questions, not just active ones: a since-retired question may still
    // hold an answer on an old visit, and the read view must show it.
    supabase
      .from("questions")
      .select("*, question_options(*)")
      .order("sort_order"),
    supabase.from("visit_answers").select("*").eq("visit_id", params.id),
    supabase
      .from("complaints")
      .select("id, title, status")
      .eq("visit_id", params.id)
      .eq("is_draft", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("competitor_observations")
      .select("id, product_name, observed_price, price_includes_vat, competitors(name)")
      .eq("visit_id", params.id)
      .eq("is_draft", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_categories")
      .select("id, label_tr, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("product_category_brands")
      .select("category_id, brand_id, is_own, sort_order, product_brands!inner(name)")
      .eq("product_brands.is_active", true)
      // Global options ∪ the VISIT OWNER's custom brands (so a manager viewing
      // still sees the rep's "Diğer" additions).
      .or(
        `salesperson_id.is.null,salesperson_id.eq.${
          (visit.salesperson_id as string) ?? profile.id
        }`
      ),
    supabase
      .from("visit_product_answers")
      .select("category_id, brand_id, supply_kind")
      .eq("visit_id", params.id),
    // Full catalogs — a product answer may point at a since-retired category
    // or brand, which must still render with its real name.
    supabase.from("product_categories").select("id, label_tr"),
    supabase.from("product_brands").select("id, name"),
    company
      ? supabase
          .from("company_contacts")
          .select("*")
          .eq("company_id", company.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const allQuestions = (questions as QuestionWithOptions[]) ?? [];

  // Shelf info of the company's previous completed visit → per-category hint
  // in the products step ("Önceki ziyaret (…): Dayson, Rakip A").
  const previousProducts: Record<string, { date: string; labels: string[] }> = {};
  if (company) {
    const { data: prevVisit } = await supabase
      .from("visits")
      .select("id, visit_date")
      .eq("company_id", company.id)
      .eq("status", "tamamlandi")
      .neq("id", visit.id)
      .lte("visit_date", visit.visit_date as string)
      .order("visit_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prevVisit) {
      const { data: prevAnswers } = await supabase
        .from("visit_product_answers")
        .select("category_id, brand_id, custom_name, supply_kind, product_brands(name)")
        .eq("visit_id", prevVisit.id);
      for (const a of (prevAnswers as unknown as {
        category_id: string;
        brand_id: string | null;
        custom_name: string | null;
        supply_kind: string;
        product_brands: { name: string } | { name: string }[] | null;
      }[] | null) ?? []) {
        const b = Array.isArray(a.product_brands) ? a.product_brands[0] : a.product_brands;
        const label =
          a.supply_kind === "brand"
            ? (b?.name ?? a.custom_name ?? null)
            : (SUPPLY_KIND_LABELS[a.supply_kind as keyof typeof SUPPLY_KIND_LABELS] ?? null);
        if (!label) continue;
        const entry = (previousProducts[a.category_id] ??= {
          date: prevVisit.visit_date as string,
          labels: [],
        });
        if (!entry.labels.includes(label)) entry.labels.push(label);
      }
    }
  }
  // The wizard only offers questions that are active AND apply to this visit
  // (same helper the server uses to validate a completion).
  const applicable = applicableQuestions(
    allQuestions,
    visit.visit_type as VisitType,
    company?.kind ?? null
  );

  // Build product-matrix options: brands per active category (global ∪ this rep),
  // own brands first.
  type PcbRow = {
    category_id: string;
    brand_id: string;
    is_own: boolean;
    sort_order: number;
    product_brands: { name: string } | { name: string }[] | null;
  };
  const brandsByCat = new Map<
    string,
    { brandId: string; name: string; isOwn: boolean; sort: number }[]
  >();
  for (const row of (pcb as PcbRow[] | null) ?? []) {
    const b = Array.isArray(row.product_brands)
      ? row.product_brands[0]
      : row.product_brands;
    const arr = brandsByCat.get(row.category_id) ?? [];
    if (!arr.some((x) => x.brandId === row.brand_id))
      arr.push({
        brandId: row.brand_id,
        name: b?.name ?? "?",
        isOwn: row.is_own,
        sort: row.sort_order,
      });
    brandsByCat.set(row.category_id, arr);
  }
  const categoryOptions = ((cats as { id: string; label_tr: string }[] | null) ?? []).map(
    (c) => ({
      id: c.id,
      label_tr: c.label_tr,
      brands: (brandsByCat.get(c.id) ?? [])
        .sort(
          (a, b) =>
            Number(b.isOwn) - Number(a.isOwn) ||
            a.sort - b.sort ||
            a.name.localeCompare(b.name, "tr")
        )
        .map((b) => ({ brandId: b.brandId, name: b.name, isOwn: b.isOwn })),
    })
  );

  const linkParams = `company=${company?.id}&visit=${visit.id}`;

  // Anyone but the author reads the visit instead of stepping through the
  // wizard: the whole record on one page, and no way to alter someone
  // else's answers by accident.
  const one = <T,>(r: T | T[] | null | undefined): T | null =>
    Array.isArray(r) ? r[0] ?? null : r ?? null;
  const catLabels = new Map(
    ((allCats as { id: string; label_tr: string }[] | null) ?? []).map((c) => [
      c.id,
      c.label_tr,
    ])
  );
  const brandNames = new Map(
    ((allBrands as { id: string; name: string }[] | null) ?? []).map((b) => [
      b.id,
      b.name,
    ])
  );
  const recordProducts = (
    (products as {
      category_id: string;
      brand_id: string | null;
      supply_kind: string;
    }[]) ?? []
  ).map((p) => ({
    categoryLabel: catLabels.get(p.category_id) ?? "—",
    brandLabel: (p.brand_id && brandNames.get(p.brand_id)) || "—",
    supplyKind: p.supply_kind as "brand" | "own_production" | "export",
  }));

  return (
    <div
      className={cn(
        "mx-auto space-y-4",
        isOwner ? "max-w-md" : "max-w-3xl text-[15px] sm:text-base"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">{company?.name}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{visitCode(visit.id)}</span> ·{" "}
            {VISIT_TYPE_LABELS[visit.visit_type as keyof typeof VISIT_TYPE_LABELS]}{" "}
            ·{" "}
            {isOwner ? (
              <VisitDateEditor visitId={visit.id} visitDate={visit.visit_date as string} />
            ) : (
              formatTRDate(visit.visit_date as string)
            )}{" "}
            ·{" "}
            {company
              ? COMPANY_KIND_LABELS[company.kind as keyof typeof COMPANY_KIND_LABELS]
              : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 print:hidden">
          <div className="flex items-center gap-2">
            {visit.status === "tamamlandi" && <PrintButton />}
            <Badge variant={visit.status === "taslak" ? "warning" : "success"}>
              {VISIT_STATUS_LABELS[visit.status as keyof typeof VISIT_STATUS_LABELS]}
            </Badge>
          </div>
          {isOwner && (
            <DeleteVisitButton
              visitId={visit.id}
              completed={visit.status === "tamamlandi"}
            />
          )}
        </div>
      </div>

      {!isOwner ? (
        <Card>
          <CardContent className="pt-4">
            <VisitRecord
              showHeader={false}
              visit={{
                id: visit.id,
                visitDate: visit.visit_date,
                visitType: visit.visit_type,
                status: visit.status,
                salesperson: one(
                  visit.salesperson as unknown as { full_name: string } | null
                )?.full_name,
                contactName: one(
                  visit.contact as unknown as {
                    name: string;
                    role: string | null;
                  } | null
                )?.name,
                contactRole: one(
                  visit.contact as unknown as {
                    name: string;
                    role: string | null;
                  } | null
                )?.role,
                questions: allQuestions,
                answers: (answers as VisitAnswer[]) ?? [],
                products: recordProducts,
              }}
            />
            <div className="mt-4">
              <RecordPhotos
                refTable="visit"
                refId={visit.id}
                photos={photos}
                canEdit={canEditPhotos}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
      <VisitWizard
        visitId={visit.id}
        isOwner={isOwner}
        companyId={company?.id ?? ""}
        companyName={company?.name ?? ""}
        companyKind={(company?.kind ?? "distributor") as CompanyKind}
        visitType={visit.visit_type as VisitType}
        visitDate={visit.visit_date as string}
        questions={applicable}
        existingAnswers={(answers as VisitAnswer[]) ?? []}
        categories={categoryOptions}
        existingProducts={
          (products as {
            category_id: string;
            brand_id: string | null;
            supply_kind: string;
          }[]) ?? []
        }
        previousProducts={previousProducts}
        contacts={(contacts as CompanyContact[]) ?? []}
        currentContactId={visit.contact_id as string | null}
        initialCompleted={visit.status === "tamamlandi"}
        addonSurveys={addonSurveys}
        stepHints={stepHints}
        extraSlot={
          <RecordPhotos
            refTable="visit"
            refId={visit.id}
            photos={photos}
            canEdit
          />
        }
      />
      )}

      {/* Şikayetler — bu ziyarete bağlı */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="section-label flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Şikayetler
          </CardTitle>
          <Link href={`/sikayet/yeni?${linkParams}`}>
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Ekle
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {!complaints || complaints.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bu ziyarete bağlı şikayet yok.
            </p>
          ) : (
            complaints.map((c) => (
              <Link
                key={c.id}
                href={`/sikayet/${c.id}`}
                className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
              >
                <span>{c.title}</span>
                <Badge variant={statusVariant[c.status as ComplaintStatus]}>
                  {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {/* Stok sayımları — bu ziyarete bağlı */}
      {(company?.kind === "distributor" || (stockCounts ?? []).length > 0) && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="section-label flex items-center gap-2">
              <Boxes className="h-3.5 w-3.5" />
              Stok Sayımı
            </CardTitle>
            {isOwner && (
              <Link href={`/stok/yeni?${linkParams}&return=${encodeURIComponent(`/ziyaret/${visit.id}`)}`}>
                <Button variant="outline" size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Ekle
                </Button>
              </Link>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {!stockCounts || stockCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Bu ziyarette stok sayımı yok.</p>
            ) : (
              stockCounts.map((sc) => {
                const total = ((sc.stock_count_lines as { pallets: number }[] | null) ?? []).reduce(
                  (a, l) => a + Number(l.pallets),
                  0
                );
                return (
                  <Link
                    key={sc.id}
                    href={`/stok/${sc.id}?return=${encodeURIComponent(`/ziyaret/${visit.id}`)}`}
                    className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                  >
                    <span>
                      {stockCountCode(sc.id)}
                      {sc.note ? <span className="text-muted-foreground"> · {sc.note}</span> : null}
                    </span>
                    <span className="font-medium tabular-nums">
                      {total.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} palet
                    </span>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {/* Özel raporlar — bu ziyarete bağlı */}
      {(surveyAnswers ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="section-label flex items-center gap-2">
              <ClipboardList className="h-3.5 w-3.5" />
              Özel Raporlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(surveyAnswers ?? []).map((a) => {
              const sv = one(a.surveys as unknown as { name: string } | { name: string }[] | null);
              return (
                <Link
                  key={a.id}
                  href={`/anket/${a.survey_id}?company=${company?.id}&visit=${visit.id}&return=${encodeURIComponent(`/ziyaret/${visit.id}`)}`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                >
                  <span>{sv?.name ?? "Özel rapor"}</span>
                  <Badge variant="success">Dolduruldu</Badge>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Rakip bilgileri — bu ziyarete bağlı */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="section-label flex items-center gap-2">
            <Swords className="h-3.5 w-3.5" />
            Rakip Bilgileri
          </CardTitle>
          <Link href={`/rakip/yeni?${linkParams}`}>
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Ekle
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {!observations || observations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Bu ziyarete bağlı rakip bilgisi yok.
            </p>
          ) : (
            observations.map((o) => {
              const comp = Array.isArray(o.competitors)
                ? o.competitors[0]
                : (o.competitors as { name: string } | null);
              return (
                <Link
                  key={o.id}
                  href={`/rakip/${o.id}?return=${encodeURIComponent(`/ziyaret/${visit.id}`)}`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                >
                  <span>
                    {comp?.name} · {o.product_name}
                  </span>
                  <span className="font-medium">
                    {formatTRY(o.observed_price)}
                    {o.observed_price != null && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        {o.price_includes_vat === true ? "(KDV dahil)" : o.price_includes_vat === false ? "(KDV hariç)" : ""}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
