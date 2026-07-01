"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import type { QuestionInputType, QuestionWithOptions } from "@/types/db";
import {
  addQuestion,
  toggleQuestionActive,
  editQuestion,
  deleteQuestion,
} from "@/app/(admin)/admin/sorular/actions";

const TYPE_LABELS: Record<QuestionInputType, string> = {
  select: "Tek seçim",
  multiselect: "Çoklu seçim",
  boolean: "Evet / Hayır",
  number: "Sayı",
  date: "Tarih",
  text: "Serbest metin",
};

const NEEDS_OPTIONS: QuestionInputType[] = ["select", "multiselect"];

export function QuestionManager({
  questions,
}: {
  questions: QuestionWithOptions[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [labelTr, setLabelTr] = useState("");
  const [inputType, setInputType] = useState<QuestionInputType>("select");
  const [isRequired, setIsRequired] = useState(true);
  const [options, setOptions] = useState<{ value: string; labelTr: string }[]>([
    { value: "", labelTr: "" },
  ]);

  function add() {
    setErr(null);
    startTransition(async () => {
      const res = await addQuestion({
        code,
        labelTr,
        inputType,
        isRequired,
        options: NEEDS_OPTIONS.includes(inputType) ? options : [],
      });
      if (res.error) return setErr(res.error);
      setCode("");
      setLabelTr("");
      setOptions([{ value: "", labelTr: "" }]);
      router.refresh();
    });
  }

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      await toggleQuestionActive({ questionId: id, isActive: active });
      router.refresh();
    });
  }

  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editReq, setEditReq] = useState(true);

  function startEdit(q: QuestionWithOptions) {
    setEditing(q.id);
    setEditLabel(q.label_tr);
    setEditReq(q.is_required);
  }
  function saveEdit(id: string) {
    startTransition(async () => {
      const res = await editQuestion({
        questionId: id,
        labelTr: editLabel,
        isRequired: editReq,
      });
      if (res.error) return setErr(res.error);
      setEditing(null);
      router.refresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteQuestion({ questionId: id });
      if (res.error) return setErr(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yeni Soru</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="q-label">Soru metni</Label>
              <Input
                id="q-label"
                value={labelTr}
                onChange={(e) => setLabelTr(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-code">Kod (a-z, _)</Label>
              <Input
                id="q-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="orn: odeme_sekli"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-type">Alan tipi</Label>
              <Select
                id="q-type"
                value={inputType}
                onChange={(e) =>
                  setInputType(e.target.value as QuestionInputType)
                }
              >
                {(Object.keys(TYPE_LABELS) as QuestionInputType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <input
                id="q-req"
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="q-req">Zorunlu alan</Label>
            </div>
          </div>

          {NEEDS_OPTIONS.includes(inputType) && (
            <div className="space-y-2">
              <Label>Seçenekler</Label>
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="değer (kod)"
                    value={o.value}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x
                        )
                      )
                    }
                  />
                  <Input
                    placeholder="Görünen etiket"
                    value={o.labelTr}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, labelTr: e.target.value } : x
                        )
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setOptions((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setOptions((prev) => [...prev, { value: "", labelTr: "" }])
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Seçenek ekle
              </Button>
            </div>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button onClick={add} disabled={pending}>
            Soru Ekle
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {questions.map((q) => (
          <Card key={q.id}>
            <CardContent className="space-y-2 p-3">
              {editing === q.id ? (
                <div className="space-y-2">
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editReq}
                      onChange={(e) => setEditReq(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Zorunlu alan
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(null)}
                    >
                      Vazgeç
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => saveEdit(q.id)}
                    >
                      Kaydet
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {q.label_tr}{" "}
                      {!q.is_active && <Badge variant="secondary">Pasif</Badge>}{" "}
                      {q.is_required && <Badge variant="outline">Zorunlu</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {q.code} · {TYPE_LABELS[q.input_type]}
                      {q.question_options.length > 0 &&
                        ` · ${q.question_options
                          .map((o) => o.label_tr)
                          .join(", ")}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Düzenle"
                      disabled={pending}
                      onClick={() => startEdit(q)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => toggle(q.id, !q.is_active)}
                    >
                      {q.is_active ? "Pasif" : "Aktif"}
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      title="Sil"
                      message={`"${q.label_tr}" sorusu silinsin mi?`}
                      confirmText="Sil"
                      onConfirm={() => remove(q.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
