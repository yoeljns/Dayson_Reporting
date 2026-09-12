import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  AlertTriangle,
  Swords,
  Boxes,
  Phone,
  ClipboardList,
} from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { VisitRecord } from "@/components/visit-record";
import { CompanyNav } from "@/components/company-nav";
import { CompanyBrief } from "@/components/company-brief";
import { companyBrief } from "@/lib/companies/brief";
import { companyNeighbours, listQueryString, withQuery } from "@/lib/companies/list";
import { TargetView } from "@/components/target-view";
import { StockHistory } from "@/components/stock-history";
import { getTargetFor, latestProposalFor } from "@/lib/targets/server";
import { TargetProposalForm } from "@/components/target-proposal-form";
import { buildTargetStatus } from "@/lib/rules/target";
import { loadSalesCategories, shipmentTotalsFor } from "@/lib/sales/server";
import { getPaceThresholds } from "@/lib/settings";
import { countedSkus, companyCountHistory } from "@/lib/stock/server";
import { surveyMatches } from "@/lib/rules/survey";
import { formatTRDate, daysSince, todayIso } from "@/lib/week";
import { visitCode } from "@/lib/codes";
import {
  COMPANY_KIND_LABELS,
  VISIT_TYPE_LABELS,
  SUPPLY_KIND_LABELS,
  DEBT_STATUS_LABELS,
  COMPLAINT_STATUS_LABELS,
  type CompanyKind,
  type VisitType,
  type VisitStatus,
  type SupplyKind,
  type DebtStatus,
  type ComplaintStatus,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer, Survey } from "@/types/db";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

type VisitRow = {
  id: string;
  visit_date: string;
  visit_type: VisitType;
  status: VisitStatus;
  salesperson_id: string;
  salesperson: { full_name: string } | { full_name: string }[] | null;
  contact: { name: string; role: string | null } | { name: string; role: string | null }[] | null;
};

export default async function CompanyCardPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; q?: string; tur?: string; sirala?: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();

  // RLS: dealers only when assigned; other kinds are visible to every rep.
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, kind, city, plate_code, phone, segment, debt_status, logo_code, notes, buys_from_company_id, buys_from:buys_from_company_id(name)"
    )
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!company) notFound();
  const kind = company.kind as CompanyKind;
  const isDealer = kind === "distributor";
  const buysFrom = one(company.buys_from as { name: string } | { name: string }[] | null);

  const tabs = [
    { key: "ozet", label: "Özet" },
    ...(isDealer ? [{ key: "hedef", label: "Hedef" }] : []),
    { key: "ziyaretler", label: "Ziyaretler" },
    { key: "urunler", label: "Ürünler" },
    ...(isDealer ? [{ key: "stok", label: "Stok" }] : []),
  ];
  const tab = tabs.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "ozet";

  // Önceki / Sıradaki: the list the rep came from (params carried on the
  // link); without params, same-kind companies alphabetically.
  const hasListParams = searchParams.q != null || searchParams.tur != null || searchParams.sirala != null;
  const listParams = hasListParams
    ? { q: searchParams.q, tur: searchParams.tur, sirala: searchParams.sirala }
    : { tur: kind };
  const navQs = hasListParams ? listQueryString(listParams) : "";
  const neighbours = await companyNeighbours(supabase, listParams, company.id, 200);
  const tabQs = tab !== "ozet" ? `tab=${tab}` : "";

  const [{ data: visitsRaw }, { data: contacts }, { data: complaints }, { data: activeSurveys }] =
    await Promise.all([
      supabase
        .from("visits")
        .select(
          "id, visit_date, visit_type, status, salesperson_id, salesperson:salesperson_id(full_name), contact:contact_id(name, role)"
        )
        .eq("company_id", company.id)
        .is("deleted_at", null)
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("company_contacts")
        .select("id, name, phone, role")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false }),
      isDealer
        ? supabase
            .from("complaints")
            .select("id, title, status, created_at")
            .eq("company_id", company.id)
            .eq("is_draft", false)
            .in("status", ["acik", "islemde"])
            .order("created_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] as { id: string; title: string; status: string; created_at: string }[] }),
      supabase.from("surveys").select("*").eq("status", "aktif"),
    ]);
  const visits = (visitsRaw as VisitRow[] | null) ?? [];
  const completed = visits.filter((v) => v.status === "tamamlandi");
  const last = completed[0] ?? null;
  const lastGap = last ? daysSince(last.visit_date) : null;
  const today = todayIso();
  const surveys = ((activeSurveys as Survey[] | null) ?? []).filter((s) =>
    surveyMatches(s, { kind, plate: company.plate_code, repId: profile.id, date: today })
  );

  const brief = tab === "ozet" ? await companyBrief(supabase, company.id, { isDealer, today }) : null;

  const q = `company=${company.id}`;
  const hrefFor = (k: string) => withQuery(`/firma/${company.id}`, `tab=${k}`, navQs);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link
        href={withQuery("/firmalar", navQs)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Firmalar
      </Link>
      {neighbours && (
        <CompanyNav
          prevHref={neighbours.prev ? withQuery(`/firma/${neighbours.prev.id}`, tabQs, navQs) : null}
          prevName={neighbours.prev?.name ?? null}
          nextHref={neighbours.next ? withQuery(`/firma/${neighbours.next.id}`, tabQs, navQs) : null}
          nextName={neighbours.next?.name ?? null}
          index={neighbours.index}
          total={neighbours.total}
        />
      )}

      <div>
        <h1 className="text-xl font-semibold">{company.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Badge variant="outline">{COMPANY_KIND_LABELS[kind]}</Badge>
          {(company.plate_code || company.city) && (
            <span>{[company.plate_code, company.city].filter(Boolean).join(" ")}</span>
          )}
          {company.segment && <Badge variant="secondary">{company.segment}</Badge>}
          {company.debt_status && (
            <Badge variant={company.debt_status === "temiz" ? "success" : "destructive"}>
              {DEBT_STATUS_LABELS[company.debt_status as DebtStatus]}
            </Badge>
          )}
        </div>
        {buysFrom && (
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{buysFrom.name}</span> üzerinden alıyor
          </p>
        )}
      </div>

      {/* Launchers */}
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/ziyaret/yeni?${q}`} className="col-span-2">
          <Button className="h-12 w-full text-base">
            <Plus className="mr-2 h-5 w-5" /> Ziyaret
          </Button>
        </Link>
        {isDealer && (
          <Link href={`/sikayet/yeni?${q}`}>
            <Button variant="outline" className="h-12 w-full">
              <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" /> Şikayet
            </Button>
          </Link>
        )}
        <Link href={`/rakip/yeni?${q}`}>
          <Button variant="outline" className="h-12 w-full">
            <Swords className="mr-2 h-4 w-4 text-primary" /> Rakip bilgisi
          </Button>
        </Link>
        {isDealer && (
          <Link href={`/stok/yeni?${q}`}>
            <Button variant="outline" className="h-12 w-full">
              <Boxes className="mr-2 h-4 w-4 text-primary" /> Stok
            </Button>
          </Link>
        )}
        {surveys.map((s) => (
          <Link key={s.id} href={`/anket/${s.id}?${q}`}>
            <Button variant="outline" className="h-12 w-full">
              <ClipboardList className="mr-2 h-4 w-4 text-primary" />
              <span className="truncate">{s.name}</span>
            </Button>
          </Link>
        ))}
      </div>

      <Tabs tabs={tabs} active={tab} hrefFor={hrefFor} />

      {tab === "ozet" && (
        <div className="space-y-3">
          {brief && (
            <Card>
              <CardContent className="pt-4">
                <CompanyBrief brief={brief} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="space-y-1.5 pt-4 text-sm">
              <Row label="Son ziyaret" value={last ? `${formatTRDate(last.visit_date)}${lastGap != null ? ` (${lastGap} gün önce)` : ""}` : "Hiç ziyaret yok"} />
              <Row label="Toplam ziyaret" value={String(completed.length)} />
              {company.logo_code && <Row label="Logo kodu" value={company.logo_code} />}
              {company.phone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefon</span>
                  <a href={`tel:${company.phone}`} className="flex items-center gap-1 font-medium underline">
                    <Phone className="h-3.5 w-3.5" /> {company.phone}
                  </a>
                </div>
              )}
              {company.notes && (
                <div className="pt-1">
                  <div className="text-muted-foreground">Not</div>
                  <p className="whitespace-pre-wrap">{company.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {(contacts ?? []).length > 0 && (
            <Card>
              <CardContent className="space-y-1.5 pt-4 text-sm">
                <div className="section-label">Kişiler</div>
                {(contacts ?? []).map((c) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <span>
                      {c.name}
                      {c.role && <span className="text-muted-foreground"> · {c.role}</span>}
                    </span>
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="text-primary underline">
                        {c.phone}
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(complaints ?? []).length > 0 && (
            <Card>
              <CardContent className="space-y-1.5 pt-4 text-sm">
                <div className="section-label">Açık şikayetler</div>
                {(complaints ?? []).map((c) => (
                  <Link
                    key={c.id}
                    href={`/sikayet/${c.id}`}
                    className="flex items-center justify-between rounded-md border p-2 hover:bg-accent"
                  >
                    <span>{c.title}</span>
                    <Badge variant="warning">
                      {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {last && <LastVisitNotes visitId={last.id} visit={last} />}
        </div>
      )}

      {tab === "hedef" && isDealer && (
        <TargetTab companyId={company.id} profileId={profile.id} canPropose={profile.role === "salesperson"} />
      )}

      {tab === "ziyaretler" && (
        <div className="space-y-2">
          {visits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Ziyaret yok.</p>
          ) : (
            visits.map((v) => (
              <Link key={v.id} href={`/ziyaret/${v.id}`}>
                <Card className="hover:bg-accent">
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium">{formatTRDate(v.visit_date)}</div>
                      <div className="text-xs text-muted-foreground">
                        {VISIT_TYPE_LABELS[v.visit_type]} · {one(v.salesperson)?.full_name ?? ""} ·{" "}
                        {visitCode(v.id)}
                      </div>
                    </div>
                    <Badge variant={v.status === "taslak" ? "warning" : "success"}>
                      {v.status === "taslak" ? "Taslak" : "Tamamlandı"}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "urunler" && <ProductsTab lastVisitId={last?.id ?? null} lastDate={last?.visit_date ?? null} />}

      {tab === "stok" && isDealer && <StockTab companyId={company.id} />}
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

async function LastVisitNotes({ visitId, visit }: { visitId: string; visit: VisitRow }) {
  const supabase = createClient();
  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase.from("questions").select("*, question_options(*)").order("sort_order"),
    supabase.from("visit_answers").select("*").eq("visit_id", visitId),
  ]);
  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="section-label">Son ziyaret notları</div>
          <Link href={`/ziyaret/${visitId}`} className="text-xs underline">
            Tamamı
          </Link>
        </div>
        <VisitRecord
          showHeader={false}
          visit={{
            id: visitId,
            visitDate: visit.visit_date,
            visitType: visit.visit_type,
            status: visit.status,
            salesperson: one(visit.salesperson)?.full_name ?? null,
            contactName: one(visit.contact)?.name ?? null,
            contactRole: one(visit.contact)?.role ?? null,
            questions: (questions as QuestionWithOptions[] | null) ?? [],
            answers: (answers as VisitAnswer[] | null) ?? [],
            products: [],
          }}
        />
      </CardContent>
    </Card>
  );
}

async function TargetTab({
  companyId,
  profileId,
  canPropose,
}: {
  companyId: string;
  profileId: string;
  canPropose: boolean;
}) {
  const supabase = createClient();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const [target, thresholds, categories, shipments, latest] = await Promise.all([
    getTargetFor(supabase, companyId, year),
    getPaceThresholds(),
    loadSalesCategories(supabase),
    shipmentTotalsFor(supabase, companyId, year),
    canPropose ? latestProposalFor(supabase, companyId, year, profileId) : Promise.resolve(null),
  ]);
  const status = buildTargetStatus(target?.lines ?? [], categories, shipments, year, today, thresholds);
  const current: Record<string, { target: number; monthly: number[] | null }> = {};
  for (const l of target?.lines ?? []) {
    if (!l.sales_category_id) continue;
    current[l.sales_category_id] = { target: Number(l.target_qty) || 0, monthly: l.monthly_qty ?? null };
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="section-label mb-2">{year} hedefi</div>
          <TargetView status={status} target={target} compact showEur={false} />
        </CardContent>
      </Card>
      {canPropose && (
        <TargetProposalForm companyId={companyId} year={year} categories={categories} current={current} latest={latest} />
      )}
    </div>
  );
}

async function ProductsTab({
  lastVisitId,
  lastDate,
}: {
  lastVisitId: string | null;
  lastDate: string | null;
}) {
  if (!lastVisitId)
    return <p className="py-6 text-center text-sm text-muted-foreground">Henüz ürün bilgisi yok.</p>;
  const supabase = createClient();
  const [{ data: products }, { data: cats }, { data: brands }] = await Promise.all([
    supabase
      .from("visit_product_answers")
      .select("category_id, brand_id, supply_kind")
      .eq("visit_id", lastVisitId),
    supabase.from("product_categories").select("id, label_tr, sort_order").order("sort_order"),
    supabase.from("product_brands").select("id, name"),
  ]);
  const catName = new Map((cats ?? []).map((c) => [c.id, c.label_tr]));
  const brandName = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const rows = ((products as { category_id: string; brand_id: string | null; supply_kind: SupplyKind }[] | null) ?? []);
  return (
    <Card>
      <CardContent className="space-y-2 pt-4 text-sm">
        <div className="section-label">
          Kullandığı ürünler / markalar {lastDate ? `(${formatTRDate(lastDate)})` : ""}
        </div>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">Son ziyarette ürün bilgisi girilmemiş.</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((p, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{catName.get(p.category_id) ?? "—"}:</span>
                <span>
                  {p.supply_kind !== "brand"
                    ? SUPPLY_KIND_LABELS[p.supply_kind]
                    : (p.brand_id && brandName.get(p.brand_id)) || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

async function StockTab({ companyId }: { companyId: string }) {
  const supabase = createClient();
  const [skus, history] = await Promise.all([
    countedSkus(supabase),
    companyCountHistory(supabase, companyId, 10),
  ]);
  return (
    <Card>
      <CardContent className="pt-4">
        <StockHistory counts={history} skus={skus} />
      </CardContent>
    </Card>
  );
}
