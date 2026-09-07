"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/ui/toast";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  SURVEY_INPUT_TYPES,
  SURVEY_INPUT_TYPE_LABELS,
  SURVEY_STATUS_LABELS,
  type CompanyKind,
  type SurveyInputType,
  type SurveyStatus,
} from "@/lib/enums";
import { selectOptions, scaleBounds } from "@/lib/rules/survey";
import type { Survey, SurveyQuestion } from "@/types/db";
import {
  saveSurvey,
  setSurveyStatus,
  deleteSurvey,
  upsertSurveyQuestion,
  deleteSurveyQuestion,
  reorderSurveyQuestion,
} from "@/app/(admin)/admin/anketler/actions";

type Rep = { id: string; full_name: string };

const STATUS_BADGE: Record<SurveyStatus, "warning" | "success" | "secondary"> = {
  taslak: "warning",
  aktif: "success",
  kapandi: "secondary",
};

/** "Yeni özel rapor" — name only, the rest is edited on the detail page. */
export function SurveyCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[16rem] flex-1 space-y-1">
        <Label htmlFor="sv-name">Yeni özel rapor</Label>
        <Input
          id="sv-name"
          placeholder="örn. Kış sezonu raf kontrolü"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button
        disabled={pending || !name.trim()}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const res = await saveSurvey({ name, allowRepeat: false });
            if (res.error || !res.id) return setErr(res.error ?? "Oluşturulamadı.");
            router.push(`/admin/anketler/${res.id}`);
          });
        }}
      >
        <Plus className="mr-1 h-4 w-4" /> Oluştur
      </Button>
      {err && <p className="w-full text-sm text-destructive">{err}</p>}
    </div>
  );
}

export function SurveyBuilder({
  survey,
  questions,
  reps,
  answerCount,
}: {
  survey: Survey;
  questions: SurveyQuestion[];
  reps: Rep[];
  answerCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // ---- header ----
  const [name, setName] = useState(survey.name);
  const [description, setDescription] = useState(survey.description ?? "");
  const [validFrom, setValidFrom] = useState(survey.valid_from ?? "");
  const [validTo, setValidTo] = useState(survey.valid_to ?? "");
  const [kinds, setKinds] = useState<CompanyKind[]>(survey.target_kinds ?? []);
  const [plates, setPlates] = useState((survey.target_plates ?? []).join(", "));
  const [repIds, setRepIds] = useState<string[]>(survey.target_reps ?? []);
  const [allowRepeat, setAllowRepeat] = useState(survey.allow_repeat);

  function run(fn: () => Promise<{ error?: string }>, okMsg?: string) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setErr(res.error);
        toast(res.error, "warn");
        return;
      }
      if (okMsg) toast(okMsg, "ok");
      router.refresh();
    });
  }

  function saveHeader() {
    run(
      () =>
        saveSurvey({
          id: survey.id,
          name,
          description,
          validFrom: validFrom || null,
          validTo: validTo || null,
          targetKinds: kinds,
          targetPlates: plates.split(/[,\s]+/).filter(Boolean),
          targetReps: repIds,
          allowRepeat,
        }),
      "Rapor kaydedildi"
    );
  }

  // ---- question editor ----
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState<SurveyInputType>("boolean");
  const [qRequired, setQRequired] = useState(true);
  const [qOptions, setQOptions] = useState<{ value: string; label: string }[]>([
    { value: "", label: "" },
    { value: "", label: "" },
  ]);
  const [qScale, setQScale] = useState({ min: 1, max: 5 });

  function startNew() {
    setEditing("new");
    setQPrompt("");
    setQType("boolean");
    setQRequired(true);
    setQOptions([
      { value: "", label: "" },
      { value: "", label: "" },
    ]);
    setQScale({ min: 1, max: 5 });
  }
  function startEdit(q: SurveyQuestion) {
    setEditing(q.id);
    setQPrompt(q.prompt);
    setQType(q.input_type);
    setQRequired(q.is_required);
    const opts = selectOptions(q.options);
    setQOptions(opts.length > 0 ? opts : [{ value: "", label: "" }, { value: "", label: "" }]);
    setQScale(scaleBounds(q.options));
  }
  function saveQuestion() {
    run(
      async () => {
        const res = await upsertSurveyQuestion({
          surveyId: survey.id,
          questionId: editing === "new" ? null : editing,
          prompt: qPrompt,
          inputType: qType,
          options: qType === "select" ? qOptions : null,
          scale: qType === "scale" ? qScale : null,
          isRequired: qRequired,
        });
        if (!res.error) setEditing(null);
        return res;
      },
      editing === "new" ? "Soru eklendi" : "Soru güncellendi"
    );
  }

  const locked = survey.status !== "taslak" && answerCount > 0;

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_BADGE[survey.status]}>
            {SURVEY_STATUS_LABELS[survey.status]}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {questions.length} soru · {answerCount} cevap
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {survey.status !== "aktif" && (
            <Button
              size="sm"
              disabled={pending || questions.length === 0}
              onClick={() =>
                run(() => setSurveyStatus({ id: survey.id, status: "aktif" }), "Rapor yayında")
              }
            >
              Yayınla
            </Button>
          )}
          {survey.status === "aktif" && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => setSurveyStatus({ id: survey.id, status: "kapandi" }), "Rapor kapatıldı")
              }
            >
              Kapat
            </Button>
          )}
          {survey.status === "kapandi" && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => setSurveyStatus({ id: survey.id, status: "taslak" }), "Taslağa alındı")
              }
            >
              Taslağa al
            </Button>
          )}
          {answerCount === 0 && (
            <ConfirmButton
              size="sm"
              variant="ghost"
              className="text-destructive"
              message="Bu özel rapor silinsin mi?"
              confirmText="Sil"
              onConfirm={() =>
                run(async () => {
                  const r = await deleteSurvey({ id: survey.id });
                  if (!r.error) router.push("/admin/anketler");
                  return r;
                })
              }
            >
              <Trash2 className="mr-1 h-4 w-4" /> Sil
            </ConfirmButton>
          )}
        </div>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rapor bilgileri</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="sb-name">Ad</Label>
            <Input id="sb-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-desc">Açıklama (pazarlamacı görür)</Label>
            <Textarea
              id="sb-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sb-from">Başlangıç</Label>
              <Input
                id="sb-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sb-to">Bitiş</Label>
              <Input
                id="sb-to"
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Hangi firma türlerinde sorulsun?</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {COMPANY_KINDS.map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={kinds.includes(k)}
                    onChange={(e) =>
                      setKinds(
                        e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k)
                      )
                    }
                  />
                  {COMPANY_KIND_LABELS[k]}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Hiçbiri seçili değilse tüm türlerde sorulur.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sb-plates">Plaka kodları (boş = tüm iller)</Label>
            <Input
              id="sb-plates"
              placeholder="34, 41, 16"
              value={plates}
              onChange={(e) => setPlates(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Pazarlamacılar (boş = herkes)</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {reps.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={repIds.includes(r.id)}
                    onChange={(e) =>
                      setRepIds(
                        e.target.checked
                          ? [...repIds, r.id]
                          : repIds.filter((x) => x !== r.id)
                      )
                    }
                  />
                  {r.full_name}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allowRepeat}
              onChange={(e) => setAllowRepeat(e.target.checked)}
            />
            Aynı firma için birden çok kez doldurulabilsin
          </label>
          {err && editing === null && <p className="text-sm text-destructive">{err}</p>}
          <Button disabled={pending} onClick={saveHeader}>
            Kaydet
          </Button>
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Sorular</CardTitle>
          {editing === null && (
            <Button size="sm" variant="outline" onClick={startNew} disabled={pending}>
              <Plus className="mr-1 h-4 w-4" /> Soru ekle
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {locked && (
            <p className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              Cevap alınmış bir raporda soru değiştirmek eski cevapların anlamını
              bozabilir; gerekiyorsa yeni bir rapor açın.
            </p>
          )}
          {questions.length === 0 && editing === null && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Henüz soru yok.
            </p>
          )}
          {questions.map((q, idx) =>
            editing === q.id ? (
              <QuestionEditor
                key={q.id}
                prompt={qPrompt}
                setPrompt={setQPrompt}
                type={qType}
                setType={setQType}
                required={qRequired}
                setRequired={setQRequired}
                options={qOptions}
                setOptions={setQOptions}
                scale={qScale}
                setScale={setQScale}
                pending={pending}
                err={err}
                onCancel={() => setEditing(null)}
                onSave={saveQuestion}
              />
            ) : (
              <div
                key={q.id}
                className="flex items-start justify-between gap-2 rounded-md border p-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {idx + 1}. {q.prompt}{" "}
                    {q.is_required ? (
                      <Badge variant="warning">Zorunlu</Badge>
                    ) : (
                      <Badge variant="outline">İsteğe bağlı</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {SURVEY_INPUT_TYPE_LABELS[q.input_type]}
                    {q.input_type === "select" &&
                      ` · ${selectOptions(q.options)
                        .map((o) => o.label)
                        .join(", ")}`}
                    {q.input_type === "scale" &&
                      ` · ${scaleBounds(q.options).min}–${scaleBounds(q.options).max}`}
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || idx === 0}
                    onClick={() =>
                      run(() =>
                        reorderSurveyQuestion({
                          surveyId: survey.id,
                          questionId: q.id,
                          direction: "up",
                        })
                      )
                    }
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || idx === questions.length - 1}
                    onClick={() =>
                      run(() =>
                        reorderSurveyQuestion({
                          surveyId: survey.id,
                          questionId: q.id,
                          direction: "down",
                        })
                      )
                    }
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onClick={() => startEdit(q)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <ConfirmButton
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    message="Soru silinsin mi?"
                    confirmText="Sil"
                    onConfirm={() =>
                      run(
                        () =>
                          deleteSurveyQuestion({ surveyId: survey.id, questionId: q.id }),
                        "Soru silindi"
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
            )
          )}
          {editing === "new" && (
            <QuestionEditor
              prompt={qPrompt}
              setPrompt={setQPrompt}
              type={qType}
              setType={setQType}
              required={qRequired}
              setRequired={setQRequired}
              options={qOptions}
              setOptions={setQOptions}
              scale={qScale}
              setScale={setQScale}
              pending={pending}
              err={err}
              onCancel={() => setEditing(null)}
              onSave={saveQuestion}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuestionEditor(p: {
  prompt: string;
  setPrompt: (v: string) => void;
  type: SurveyInputType;
  setType: (v: SurveyInputType) => void;
  required: boolean;
  setRequired: (v: boolean) => void;
  options: { value: string; label: string }[];
  setOptions: (v: { value: string; label: string }[]) => void;
  scale: { min: number; max: number };
  setScale: (v: { min: number; max: number }) => void;
  pending: boolean;
  err: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="space-y-1">
        <Label>Soru</Label>
        <Input value={p.prompt} onChange={(e) => p.setPrompt(e.target.value)} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Tip</Label>
          <Select value={p.type} onChange={(e) => p.setType(e.target.value as SurveyInputType)}>
            {SURVEY_INPUT_TYPES.map((t) => (
              <option key={t} value={t}>
                {SURVEY_INPUT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={p.required}
            onChange={(e) => p.setRequired(e.target.checked)}
          />
          Zorunlu
        </label>
      </div>
      {p.type === "select" && (
        <div className="space-y-1">
          <Label>Seçenekler</Label>
          {p.options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input
                className="w-32"
                placeholder="kod"
                value={o.value}
                onChange={(e) =>
                  p.setOptions(
                    p.options.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                  )
                }
              />
              <Input
                placeholder="Etiket"
                value={o.label}
                onChange={(e) =>
                  p.setOptions(
                    p.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => p.setOptions(p.options.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => p.setOptions([...p.options, { value: "", label: "" }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Seçenek
          </Button>
        </div>
      )}
      {p.type === "scale" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label>En düşük</Label>
            <Input
              type="number"
              value={p.scale.min}
              onChange={(e) => p.setScale({ ...p.scale, min: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label>En yüksek</Label>
            <Input
              type="number"
              value={p.scale.max}
              onChange={(e) => p.setScale({ ...p.scale, max: Number(e.target.value) })}
            />
          </div>
        </div>
      )}
      {p.err && <p className="text-sm text-destructive">{p.err}</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" type="button" onClick={p.onCancel}>
          Vazgeç
        </Button>
        <Button size="sm" type="button" disabled={p.pending} onClick={p.onSave}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}
