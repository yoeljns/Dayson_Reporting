import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SurveyForm } from "@/components/survey-form";
import { surveyMatches } from "@/lib/rules/survey";
import { todayIso } from "@/lib/week";
import type { Survey, SurveyQuestion } from "@/types/db";
import type { SurveyAnswerValue } from "@/app/(app)/anket/actions";

export default async function SurveyFillPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { company?: string; visit?: string; return?: string };
}) {
  const profile = await requireProfile();
  const supabase = createClient();

  const [{ data: survey }, { data: questions }] = await Promise.all([
    supabase.from("surveys").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("survey_questions")
      .select("*")
      .eq("survey_id", params.id)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (!survey) notFound();
  const s = survey as Survey;

  let company: { id: string; name: string } | null = null;
  let visitDate: string | null = null;
  let notApplicable: string | null = null;
  if (searchParams.company) {
    const { data: c } = await supabase
      .from("companies")
      .select("id, name, kind, plate_code")
      .eq("id", searchParams.company)
      .maybeSingle();
    if (c) {
      company = { id: c.id, name: c.name };
      if (
        !surveyMatches(s, {
          kind: c.kind,
          plate: c.plate_code,
          repId: profile.id,
          date: todayIso(),
        })
      )
        notApplicable = "Bu özel rapor bu firma için geçerli değil.";
    }
  }
  if (searchParams.visit) {
    const { data: v } = await supabase
      .from("visits")
      .select("visit_date")
      .eq("id", searchParams.visit)
      .maybeSingle();
    visitDate = (v?.visit_date as string | null) ?? null;
  }

  // Same-day answer for this company → edit in place.
  let initial: Record<string, SurveyAnswerValue> | null = null;
  if (company) {
    const { data: a } = await supabase
      .from("survey_answers")
      .select("answers")
      .eq("survey_id", s.id)
      .eq("company_id", company.id)
      .eq("salesperson_id", profile.id)
      .eq("answered_at", visitDate ?? todayIso())
      .maybeSingle();
    initial = (a?.answers as Record<string, SurveyAnswerValue> | null) ?? null;
  }

  const back = searchParams.return || "/anket";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link
        href={back}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {searchParams.return ? "Ziyarete dön" : "Özel raporlar"}
      </Link>
      <div>
        <h1 className="text-lg font-semibold">{s.name}</h1>
        {s.description && (
          <p className="text-sm text-muted-foreground">{s.description}</p>
        )}
      </div>
      {notApplicable ? (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">{notApplicable}</p>
      ) : (
        <SurveyForm
          surveyId={s.id}
          questions={(questions as SurveyQuestion[] | null) ?? []}
          company={company}
          allowedKinds={s.target_kinds}
          visitId={searchParams.visit ?? null}
          visitDate={visitDate}
          initialAnswers={initial}
          returnTo={searchParams.return ?? null}
        />
      )}
    </div>
  );
}
