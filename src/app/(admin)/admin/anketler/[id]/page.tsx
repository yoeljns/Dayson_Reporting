import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PercentBar } from "@/components/ui/percent-bar";
import { SurveyBuilder } from "@/components/survey-builder";
import { formatTRDate } from "@/lib/week";
import {
  selectOptions,
  scaleBounds,
  formatSurveyAnswer,
  surveyAnswerGiven,
} from "@/lib/rules/survey";
import type { Survey, SurveyQuestion, SurveyAnswer } from "@/types/db";

type AnswerRow = SurveyAnswer & {
  companies: { name: string } | { name: string }[] | null;
  salesperson: { full_name: string } | { full_name: string }[] | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function SurveyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireManager();
  const supabase = createClient();

  const [{ data: survey }, { data: questions }, { data: answers }, { data: reps }] =
    await Promise.all([
      supabase.from("surveys").select("*").eq("id", params.id).maybeSingle(),
      supabase
        .from("survey_questions")
        .select("*")
        .eq("survey_id", params.id)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("survey_answers")
        .select("*, companies(name), salesperson:salesperson_id(full_name)")
        .eq("survey_id", params.id)
        .order("answered_at", { ascending: false })
        .limit(500),
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .eq("role", "salesperson")
        .order("full_name"),
    ]);
  if (!survey) notFound();

  const qs = (questions as SurveyQuestion[] | null) ?? [];
  const rows = (answers as AnswerRow[] | null) ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/anketler"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Özel raporlar
      </Link>
      <h1 className="text-xl font-semibold">{(survey as Survey).name}</h1>

      <SurveyBuilder
        survey={survey as Survey}
        questions={qs}
        reps={(reps as { id: string; full_name: string }[]) ?? []}
        answerCount={rows.length}
      />

      {/* Results */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Sonuçlar ({rows.length} cevap)</CardTitle>
          {rows.length > 0 && (
            <Link href={`/api/admin/raporlar?type=anket&survey=${survey.id}`}>
              <Button variant="outline" size="sm">
                <Download className="mr-1 h-4 w-4" /> Excel
              </Button>
            </Link>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz cevap yok.</p>
          ) : (
            qs.map((q) => <QuestionSummary key={q.id} q={q} rows={rows} />)
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cevap listesi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-medium">{one(r.companies)?.name ?? "Firma"}</span>
                  <span className="text-xs text-muted-foreground">
                    {one(r.salesperson)?.full_name ?? "—"} · {formatTRDate(r.answered_at)}
                  </span>
                </div>
                <dl className="mt-2 space-y-1">
                  {qs.map((q) => (
                    <div key={q.id} className="flex gap-2">
                      <dt className="w-1/2 shrink-0 text-muted-foreground">{q.prompt}</dt>
                      <dd className="whitespace-pre-wrap font-medium">
                        {formatSurveyAnswer(q.input_type, q.options, r.answers?.[q.id])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function QuestionSummary({ q, rows }: { q: SurveyQuestion; rows: AnswerRow[] }) {
  const values = rows
    .map((r) => r.answers?.[q.id])
    .filter((v) => surveyAnswerGiven(v));
  const n = values.length;
  const header = (
    <div className="flex items-baseline justify-between gap-2">
      <div className="font-medium">{q.prompt}</div>
      <div className="shrink-0 text-xs text-muted-foreground">{n} cevap</div>
    </div>
  );

  if (q.input_type === "boolean" || q.input_type === "select") {
    const buckets: { label: string; count: number }[] =
      q.input_type === "boolean"
        ? [
            { label: "Evet", count: values.filter((v) => v === true || v === "true").length },
            { label: "Hayır", count: values.filter((v) => v === false || v === "false").length },
          ]
        : selectOptions(q.options).map((o) => ({
            label: o.label,
            count: values.filter((v) => String(v) === o.value).length,
          }));
    return (
      <div className="space-y-1.5">
        {header}
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center justify-between gap-2 text-sm">
            <span>{b.label}</span>
            <span className="flex items-center gap-3">
              <span className="tabular-nums text-muted-foreground">{b.count}</span>
              <PercentBar pct={n ? (b.count / n) * 100 : 0} />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (q.input_type === "number" || q.input_type === "scale") {
    const nums = values.map(Number).filter((x) => Number.isFinite(x));
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    const { min, max } = scaleBounds(q.options);
    return (
      <div className="space-y-1">
        {header}
        <div className="text-sm">
          Ortalama:{" "}
          <span className="font-medium tabular-nums">
            {avg == null ? "—" : avg.toFixed(1)}
          </span>
          {q.input_type === "scale" && (
            <span className="text-muted-foreground">
              {" "}
              ({min}–{max} arası)
            </span>
          )}
          {nums.length > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · en düşük {Math.min(...nums)} · en yüksek {Math.max(...nums)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {header}
      <ul className="space-y-1 text-sm">
        {values.slice(0, 20).map((v, i) => (
          <li key={i} className="rounded border bg-muted/20 px-2 py-1 whitespace-pre-wrap">
            {String(v)}
          </li>
        ))}
        {values.length > 20 && (
          <li className="text-xs text-muted-foreground">
            +{values.length - 20} cevap daha (Excel&apos;de tümü)
          </li>
        )}
      </ul>
    </div>
  );
}
