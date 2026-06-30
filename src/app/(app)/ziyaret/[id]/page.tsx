import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Swords, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { VisitForm } from "@/components/visit-form";
import { DeleteVisitButton } from "@/components/delete-visit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTRY } from "@/lib/utils";
import {
  VISIT_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  COMPANY_KIND_LABELS,
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  type ComplaintStatus,
  type ComplaintType,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer } from "@/types/db";

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
  await requireProfile();
  const supabase = createClient();

  const { data: visit } = await supabase
    .from("visits")
    .select(
      "id, visit_type, status, visit_date, companies(id, name, kind, city, segment, debt_status)"
    )
    .eq("id", params.id)
    .single();

  if (!visit) notFound();

  const company = Array.isArray(visit.companies)
    ? visit.companies[0]
    : (visit.companies as {
        id: string;
        name: string;
        kind: "distributor" | "non_customer";
        city: string | null;
        segment: string | null;
        debt_status: string | null;
      } | null);

  const [{ data: questions }, { data: answers }, { data: complaints }, { data: observations }] =
    await Promise.all([
      supabase
        .from("questions")
        .select("*, question_options(*)")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("visit_answers").select("*").eq("visit_id", params.id),
      supabase
        .from("complaints")
        .select("id, title, type, status")
        .eq("visit_id", params.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("competitor_observations")
        .select("id, product_name, observed_price, competitors(name)")
        .eq("visit_id", params.id)
        .order("created_at", { ascending: false }),
    ]);

  // Filter questions by visit type (applies_to null = all).
  const applicable = ((questions as QuestionWithOptions[]) ?? []).filter(
    (q) => !q.applies_to || q.applies_to.includes(visit.visit_type)
  );

  const linkParams = `company=${company?.id}&visit=${visit.id}`;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">{company?.name}</h1>
          <p className="text-sm text-muted-foreground">
            {VISIT_TYPE_LABELS[visit.visit_type as keyof typeof VISIT_TYPE_LABELS]}{" "}
            · {visit.visit_date} ·{" "}
            {company
              ? COMPANY_KIND_LABELS[company.kind as keyof typeof COMPANY_KIND_LABELS]
              : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={visit.status === "taslak" ? "warning" : "success"}>
            {VISIT_STATUS_LABELS[visit.status as keyof typeof VISIT_STATUS_LABELS]}
          </Badge>
          {visit.status === "taslak" && (
            <DeleteVisitButton visitId={visit.id} />
          )}
        </div>
      </div>

      <VisitForm
        visitId={visit.id}
        questions={applicable}
        existing={(answers as VisitAnswer[]) ?? []}
        initialCompleted={visit.status === "tamamlandi"}
      />

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
                <span>
                  {c.title}{" "}
                  <span className="text-muted-foreground">
                    · {COMPLAINT_TYPE_LABELS[c.type as ComplaintType]}
                  </span>
                </span>
                <Badge variant={statusVariant[c.status as ComplaintStatus]}>
                  {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

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
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <span>
                    {comp?.name} · {o.product_name}
                  </span>
                  <span className="font-medium">
                    {formatTRY(o.observed_price)}
                  </span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
