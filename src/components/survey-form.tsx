"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyPicker, type PickedCompany } from "@/components/company-picker";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { newId } from "@/lib/uuid";
import { selectOptions, scaleBounds, surveyAnswerGiven } from "@/lib/rules/survey";
import type { CompanyKind } from "@/lib/enums";
import type { SurveyQuestion } from "@/types/db";
import { saveSurveyAnswer, type SurveyAnswerValue } from "@/app/(app)/anket/actions";

export function SurveyForm({
  surveyId,
  questions,
  company,
  allowedKinds,
  visitId,
  visitDate,
  initialAnswers,
  returnTo,
}: {
  surveyId: string;
  questions: SurveyQuestion[];
  /** Preset company (from a visit); otherwise the rep picks one. */
  company: PickedCompany | null;
  allowedKinds: CompanyKind[] | null;
  visitId: string | null;
  visitDate: string | null;
  initialAnswers: Record<string, SurveyAnswerValue> | null;
  returnTo: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [clientId] = useState(() => newId());
  const [picked, setPicked] = useState<PickedCompany | null>(company);
  const [answers, setAnswers] = useState<Record<string, SurveyAnswerValue>>(
    initialAnswers ?? {}
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (id: string, v: SurveyAnswerValue) =>
    setAnswers((prev) => ({ ...prev, [id]: v }));

  const missing = questions.filter(
    (q) => q.is_required && !surveyAnswerGiven(answers[q.id])
  );

  function submit() {
    setError(null);
    if (!picked) return setError("Firma seçin.");
    if (missing.length > 0)
      return setError(`"${missing[0].prompt}" sorusu zorunludur.`);
    startTransition(async () => {
      try {
        const res = await saveSurveyAnswer({
          clientId,
          surveyId,
          companyId: picked.id,
          visitId,
          answers,
          answeredAt: visitDate,
        });
        if (res.error) return setError(res.error);
        toast("Özel rapor kaydedildi", "ok");
        router.push(returnTo || "/anket");
      } catch {
        setError("Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 pt-4">
        <div className="space-y-1.5">
          <Label>Firma *</Label>
          {company ? (
            <div className="rounded-md border p-3 font-medium">{company.name}</div>
          ) : (
            <CompanyPicker
              value={picked}
              onChange={setPicked}
              minChars={2}
              kinds={allowedKinds ?? undefined}
            />
          )}
        </div>

        {questions.map((q, i) => (
          <div key={q.id} className="space-y-1.5">
            <Label className="leading-snug">
              {i + 1}. {q.prompt}
              {q.is_required && <span className="text-destructive"> *</span>}
            </Label>
            <QuestionInput q={q} value={answers[q.id] ?? null} onChange={(v) => set(q.id, v)} />
          </div>
        ))}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="w-full"
          size="lg"
          disabled={pending || !picked || missing.length > 0}
          onClick={submit}
        >
          Kaydet
        </Button>
        {returnTo && (
          <Button variant="ghost" className="w-full" onClick={() => router.push(returnTo)}>
            Ziyarete dön
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionInput({
  q,
  value,
  onChange,
}: {
  q: SurveyQuestion;
  value: SurveyAnswerValue;
  onChange: (v: SurveyAnswerValue) => void;
}) {
  const chip = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-2 text-sm font-medium",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
    );

  switch (q.input_type) {
    case "boolean":
      return (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={chip(value === true)} onClick={() => onChange(true)}>
            Evet
          </button>
          <button type="button" className={chip(value === false)} onClick={() => onChange(false)}>
            Hayır
          </button>
        </div>
      );
    case "select":
      return (
        <div className="grid grid-cols-2 gap-2">
          {selectOptions(q.options).map((o) => (
            <button
              key={o.value}
              type="button"
              className={chip(value === o.value)}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    case "scale": {
      const { min, max } = scaleBounds(q.options);
      const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div className="flex flex-wrap gap-2">
          {steps.map((n) => (
            <button
              key={n}
              type="button"
              className={cn(chip(value === n), "min-w-[2.75rem]")}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }
    case "number":
      return (
        <Input
          type="number"
          inputMode="decimal"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    default:
      return (
        <Textarea
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
