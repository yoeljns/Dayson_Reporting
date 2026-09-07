import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TargetEditor } from "@/components/target-editor";
import { TargetView } from "@/components/target-view";
import { ensureTarget } from "@/app/(admin)/admin/hedefler/actions";
import { getTargetFor } from "@/lib/targets/server";
import { elapsedFractionOfYear } from "@/lib/rules/target";
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

  // A draft row is created on first open so lines can be saved right away.
  const ensured = await ensureTarget({ companyId: company.id, year });
  if (ensured.error) throw new Error(ensured.error);

  const [target, { data: cats }, { data: contacts }, thresholds] = await Promise.all([
    getTargetFor(supabase, company.id, year),
    supabase
      .from("product_categories")
      .select("id, label_tr")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("company_contacts")
      .select("id, name, role")
      .eq("company_id", company.id)
      .order("name"),
    getPaceThresholds(),
  ]);
  if (!target) notFound();
  const categories = (cats as { id: string; label_tr: string }[] | null) ?? [];
  const elapsed = elapsedFractionOfYear(year, todayIso());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/admin/hedefler?year=${year}`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Hedefler
      </Link>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Özet</CardTitle>
        </CardHeader>
        <CardContent>
          <TargetView
            target={target}
            categories={categories}
            elapsed={elapsed}
            thresholds={thresholds}
          />
        </CardContent>
      </Card>

      <TargetEditor
        target={target}
        companyId={company.id}
        year={year}
        categories={categories}
        contacts={(contacts as { id: string; name: string; role: string | null }[] | null) ?? []}
      />
    </div>
  );
}
