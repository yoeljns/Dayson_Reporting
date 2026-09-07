"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/week";
import { surveyMatches, surveyAnswerGiven } from "@/lib/rules/survey";
import type { Survey, SurveyQuestion } from "@/types/db";

export type SurveyAnswerValue = string | number | boolean | null;

/**
 * Save a rep's answers to a survey for one company. One record per
 * (survey, company, rep, day) — a resubmit the same day updates it. Surveys
 * with allow_repeat=false accept a single record per company ever.
 */
export async function saveSurveyAnswer(input: {
  /** Client-generated uuid (offline replay). */
  clientId?: string | null;
  surveyId: string;
  companyId: string;
  visitId?: string | null;
  answers: Record<string, SurveyAnswerValue>;
  /** YYYY-MM-DD; defaults to today (Istanbul). */
  answeredAt?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const [{ data: survey }, { data: questions }, { data: company }] =
    await Promise.all([
      supabase.from("surveys").select("*").eq("id", input.surveyId).maybeSingle(),
      supabase
        .from("survey_questions")
        .select("*")
        .eq("survey_id", input.surveyId)
        .order("sort_order"),
      supabase
        .from("companies")
        .select("id, kind, plate_code")
        .eq("id", input.companyId)
        .maybeSingle(),
    ]);
  if (!survey) return { error: "Rapor bulunamadı veya artık aktif değil." };
  if (!company) return { error: "Firma bulunamadı." };

  const answeredAt =
    input.answeredAt && /^\d{4}-\d{2}-\d{2}$/.test(input.answeredAt)
      ? input.answeredAt
      : todayIso();
  const s = survey as Survey;
  if (
    !surveyMatches(s, {
      kind: company.kind,
      plate: company.plate_code,
      repId: user.id,
      date: answeredAt,
    })
  )
    return { error: "Bu rapor bu firma için geçerli değil." };

  const qs = (questions ?? []) as SurveyQuestion[];
  const answers: Record<string, SurveyAnswerValue> = {};
  for (const q of qs) {
    const v = input.answers[q.id];
    if (q.is_required && !surveyAnswerGiven(v))
      return { error: `"${q.prompt}" sorusu zorunludur.` };
    if (surveyAnswerGiven(v)) answers[q.id] = v ?? null;
  }

  // Same-day record → update; otherwise insert (unless repeats are blocked).
  const { data: sameDay } = await supabase
    .from("survey_answers")
    .select("id")
    .eq("survey_id", s.id)
    .eq("company_id", company.id)
    .eq("salesperson_id", user.id)
    .eq("answered_at", answeredAt)
    .maybeSingle();

  if (sameDay) {
    const { error } = await supabase
      .from("survey_answers")
      .update({
        answers,
        visit_id: input.visitId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sameDay.id);
    if (error) return { error: error.message };
    revalidate(s.id);
    return { id: sameDay.id };
  }

  if (!s.allow_repeat) {
    // Definer helper: a colleague's answer counts too (RLS would hide it).
    const { data: taken } = await supabase.rpc("survey_answered_by_anyone", {
      p_survey_id: s.id,
      p_company_id: company.id,
    });
    if (taken) return { error: "Bu rapor bu firma için zaten dolduruldu." };
  }

  const { data, error } = await supabase
    .from("survey_answers")
    .insert({
      ...(input.clientId ? { id: input.clientId } : {}),
      survey_id: s.id,
      company_id: company.id,
      visit_id: input.visitId || null,
      salesperson_id: user.id,
      answered_at: answeredAt,
      answers,
    })
    .select("id")
    .single();
  if (error) {
    if (/zaten dolduruldu/i.test(error.message))
      return { error: "Bu rapor bu firma için zaten dolduruldu." };
    if (error.code === "23505") {
      // Replay or a concurrent same-day save → converge on the existing row.
      const { data: again } = await supabase
        .from("survey_answers")
        .select("id")
        .eq("survey_id", s.id)
        .eq("company_id", company.id)
        .eq("salesperson_id", user.id)
        .eq("answered_at", answeredAt)
        .maybeSingle();
      if (again) {
        await supabase
          .from("survey_answers")
          .update({ answers, updated_at: new Date().toISOString() })
          .eq("id", again.id);
        revalidate(s.id);
        return { id: again.id };
      }
    }
    return { error: error.message };
  }
  revalidate(s.id);
  return { id: data.id };
}

function revalidate(surveyId: string) {
  revalidatePath("/anket");
  revalidatePath(`/anket/${surveyId}`);
  revalidatePath(`/admin/anketler/${surveyId}`);
}
