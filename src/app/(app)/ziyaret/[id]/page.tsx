import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { VisitForm } from "@/components/visit-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  VISIT_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  COMPANY_KIND_LABELS,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer } from "@/types/db";

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

  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase
      .from("questions")
      .select("*, question_options(*)")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("visit_answers").select("*").eq("visit_id", params.id),
  ]);

  // Filter questions by visit type (applies_to null = all).
  const applicable = ((questions as QuestionWithOptions[]) ?? []).filter(
    (q) => !q.applies_to || q.applies_to.includes(visit.visit_type)
  );

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
        <Badge variant={visit.status === "taslak" ? "warning" : "success"}>
          {VISIT_STATUS_LABELS[visit.status as keyof typeof VISIT_STATUS_LABELS]}
        </Badge>
      </div>

      <div className="flex gap-2">
        <Link href={`/sikayet/yeni?company=${company?.id}&visit=${visit.id}`}>
          <Button variant="outline" size="sm">
            <AlertTriangle className="mr-1 h-4 w-4 text-amber-500" />
            Şikayet
          </Button>
        </Link>
        <Link href={`/rakip/yeni?company=${company?.id}&visit=${visit.id}`}>
          <Button variant="outline" size="sm">
            <Swords className="mr-1 h-4 w-4" />
            Rakip bilgisi
          </Button>
        </Link>
      </div>

      <VisitForm
        visitId={visit.id}
        questions={applicable}
        existing={(answers as VisitAnswer[]) ?? []}
        initialCompleted={visit.status === "tamamlandi"}
      />
    </div>
  );
}
