import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TargetEditor } from "@/components/target-editor";
import { TargetView } from "@/components/target-view";
import { getTargetFor, getTargetRevisions, pendingProposalFor } from "@/lib/targets/server";
import { TargetProposalReview } from "@/components/target-proposal-review";
import { loadSalesCategories, shipmentTotalsFor } from "@/lib/sales/server";
import { buildTargetStatus } from "@/lib/rules/target";
import { getPaceThresholds } from "@/lib/settings";
import { todayIso } from "@/lib/week";

export default async function TargetDetailPage({
  params,
}: {
  params: { companyId: string; year: string };
}) {
  await requireManager();
  const supabase = createClient();
  const year = Number(params.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) notFound();

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, kind, city, logo_code")
    .eq("id", params.companyId)
    .maybeSingle();
  if (!company || company.kind !== "distributor") notFound();

  const [target, categories, shipments, { data: contacts }, thresholds, proposal] = await Promise.all([
    getTargetFor(supabase, company.id, year),
    loadSalesCategories(supabase),
    shipmentTotalsFor(supabase, company.id, year),
    supabase
      .from("company_contacts")
      .select("id, name, role")
      .eq("company_id", company.id)
      .order("name"),
    getPaceThresholds(),
    pendingProposalFor(supabase, company.id, year),
  ]);
  const revisions = target ? await getTargetRevisions(supabase, target.id) : [];
  const currentByCode: Record<string, { target: number; monthly: number[] | null }> = {};
  for (const c of categories) {
    const l = target?.lines.find((x) => x.sales_category_id === c.id);
    if (l) currentByCode[c.code] = { target: Number(l.target_qty) || 0, monthly: l.monthly_qty ?? null };
  }
  const today = todayIso();
  const status = buildTargetStatus(target?.lines ?? [], categories, shipments, year, today, thresholds);
  const shipped: Record<string, number> = {};
  for (const [id, t] of shipments.byCategory) shipped[id] = t.qty;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        href={`/admin/hedefler?year=${year}`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Hedefler
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            {company.name} · {year}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[company.logo_code, company.city].filter(Boolean).join(" · ")}
            {" · "}
            <Link href={`/admin/bayi/${company.id}`} className="underline">
              Bayi dosyası
            </Link>
          </p>
        </div>
        <Link href="/admin/sevkiyat" className="flex items-center gap-1 text-sm underline">
          <Upload className="h-4 w-4" /> Sevkiyat yükle
        </Link>
      </div>

      {proposal && <TargetProposalReview proposal={proposal} categories={categories} current={currentByCode} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Özet</CardTitle>
        </CardHeader>
        <CardContent>
          <TargetView status={status} target={target} revisions={revisions} categories={categories} />
        </CardContent>
      </Card>

      <TargetEditor
        target={target}
        companyId={company.id}
        year={year}
        categories={categories}
        contacts={(contacts as { id: string; name: string; role: string | null }[] | null) ?? []}
        shipped={shipped}
      />
    </div>
  );
}
