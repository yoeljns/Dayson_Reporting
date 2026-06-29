"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { saveVisit } from "@/app/(app)/ziyaret/actions";
import type { QuestionWithOptions, VisitAnswer } from "@/types/db";

type AnswerValue = string;

function answerToValue(a: VisitAnswer): AnswerValue {
  if (a.value_text != null) return a.value_text;
  if (a.value_number != null) return String(a.value_number);
  if (a.value_date != null) return a.value_date;
  return "";
}

export function VisitForm({
  visitId,
  questions,
  existing,
  initialCompleted,
}: {
  visitId: string;
  questions: QuestionWithOptions[];
  existing: VisitAnswer[];
  initialCompleted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, AnswerValue>>(() => {
    const init: Record<string, AnswerValue> = {};
    for (const a of existing) init[a.question_id] = answerToValue(a);
    return init;
  });

  function set(qid: string, v: AnswerValue) {
    setValues((prev) => ({ ...prev, [qid]: v }));
  }

  function buildAnswers() {
    return questions.map((q) => {
      const raw = values[q.id] ?? "";
      if (q.input_type === "number") {
        return {
          questionId: q.id,
          valueNumber: raw === "" ? null : Number(raw),
        };
      }
      if (q.input_type === "date") {
        return { questionId: q.id, valueDate: raw === "" ? null : raw };
      }
      return { questionId: q.id, valueText: raw === "" ? null : raw };
    });
  }

  function persist(complete: boolean) {
    setError(null);
    if (complete) {
      const missing = questions.find(
        (q) => q.is_required && !(values[q.id] ?? "").toString().trim()
      );
      if (missing) {
        setError(`"${missing.label_tr}" alanı zorunludur.`);
        return;
      }
    }
    startTransition(async () => {
      const res = await saveVisit({
        visitId,
        answers: buildAnswers(),
        complete,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <div key={q.id} className="space-y-1.5">
          <Label htmlFor={q.id}>
            {q.label_tr}
            {q.is_required && <span className="text-destructive"> *</span>}
          </Label>

          {q.input_type === "boolean" && (
            <Select
              id={q.id}
              value={values[q.id] ?? ""}
              onChange={(e) => set(q.id, e.target.value)}
            >
              <option value="">Seçiniz…</option>
              <option value="evet">Evet</option>
              <option value="hayir">Hayır</option>
            </Select>
          )}

          {(q.input_type === "select" || q.input_type === "multiselect") && (
            <Select
              id={q.id}
              value={values[q.id] ?? ""}
              onChange={(e) => set(q.id, e.target.value)}
            >
              <option value="">Seçiniz…</option>
              {[...q.question_options]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((o) => (
                  <option key={o.id} value={o.value}>
                    {o.label_tr}
                  </option>
                ))}
            </Select>
          )}

          {q.input_type === "number" && (
            <Input
              id={q.id}
              type="number"
              inputMode="decimal"
              value={values[q.id] ?? ""}
              onChange={(e) => set(q.id, e.target.value)}
            />
          )}

          {q.input_type === "date" && (
            <Input
              id={q.id}
              type="date"
              value={values[q.id] ?? ""}
              onChange={(e) => set(q.id, e.target.value)}
            />
          )}

          {q.input_type === "text" && (
            <Textarea
              id={q.id}
              value={values[q.id] ?? ""}
              onChange={(e) => set(q.id, e.target.value)}
            />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="sticky bottom-16 flex gap-2 bg-background/95 py-2 sm:bottom-0">
        <Button
          variant="outline"
          className="flex-1"
          disabled={pending}
          onClick={() => persist(false)}
        >
          Taslak kaydet
        </Button>
        <Button
          className="flex-1"
          disabled={pending}
          onClick={() => persist(true)}
        >
          {initialCompleted ? "Güncelle" : "Tamamla"}
        </Button>
      </div>
    </div>
  );
}
