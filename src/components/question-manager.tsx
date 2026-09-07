"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/ui/toast";
import { isFixedQuestionCode } from "@/lib/question-codes";
import {
  VISIT_TYPES,
  VISIT_TYPE_LABELS,
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  type VisitType,
  type CompanyKind,
} from "@/lib/enums";
import type { QuestionInputType, QuestionWithOptions } from "@/types/db";
import {
  addQuestion,
  toggleQuestionActive,
  editQuestion,
  deleteQuestion,
  reorderQuestion,
  upsertOption,
  deleteOption,
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

function scopeSummary(q: QuestionWithOptions) {
  const parts: string[] = [];
  parts.push(
    q.applies_to && q.applies_to.length > 0
      ? q.applies_to.map((t) => VISIT_TYPE_LABELS[t]).join(" + ")
      : "Her kanal"
  );
  parts.push(
    q.applies_to_kind && q.applies_to_kind.length > 0
      ? q.applies_to_kind.map((k) => COMPANY_KIND_LABELS[k]).join(" + ")
      : "Her firma türü"
  );
  return parts.join(" · ");
}

function CheckGroup<T extends string>({
  title,
  all,
  labels,
  value,
  onChange,
}: {
  title: string;
  all: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {all.map((v) => (
          <label key={v} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={value.includes(v)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, v]
                    : value.filter((x) => x !== v)
                )
              }
            />
            {labels[v]}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Hiçbiri veya tümü seçiliyse soru her yerde sorulur.
      </p>
    </div>
  );
}

export function QuestionManager({
  questions,
}: {
  questions: QuestionWithOptions[];
}) {
  const router = useRouter();
  const { toast } = useToast();
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
      toast("Soru eklendi", "ok");
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, okMsg?: string) {
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

  // ---- edit state ----
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editReq, setEditReq] = useState(true);
  const [editChannels, setEditChannels] = useState<VisitType[]>([]);
  const [editKinds, setEditKinds] = useState<CompanyKind[]>([]);
  const [newOptValue, setNewOptValue] = useState("");
  const [newOptLabel, setNewOptLabel] = useState("");
  const [optEdit, setOptEdit] = useState<{
    id: string;
    value: string;
    labelTr: string;
  } | null>(null);

  function startEdit(q: QuestionWithOptions) {
    setEditing(q.id);
    setEditLabel(q.label_tr);
    setEditReq(q.is_required);
    setEditChannels(q.applies_to ?? []);
    setEditKinds(q.applies_to_kind ?? []);
    setNewOptValue("");
    setNewOptLabel("");
    setOptEdit(null);
    setErr(null);
  }
  function saveEdit(id: string) {
    startTransition(async () => {
      const res = await editQuestion({
        questionId: id,
        labelTr: editLabel,
        isRequired: editReq,
        appliesTo: editChannels,
        appliesToKind: editKinds,
      });
      if (res.error) return setErr(res.error);
      setEditing(null);
      toast("Soru güncellendi", "ok");
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

          <p className="text-xs text-muted-foreground">
            Kanal ve firma türü kısıtını soruyu ekledikten sonra kalem simgesiyle
            düzenleyebilirsiniz. Yeni sorular listenin sonuna eklenir; ok
            tuşlarıyla sırayı değiştirin.
          </p>

          {err && editing === null && (
            <p className="text-sm text-destructive">{err}</p>
          )}
          <Button onClick={add} disabled={pending}>
            Soru Ekle
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {questions.map((q, idx) => {
          const fixed = isFixedQuestionCode(q.code);
          const hasOptions = NEEDS_OPTIONS.includes(q.input_type);
          return (
            <Card key={q.id} className={!q.is_active ? "opacity-70" : undefined}>
              <CardContent className="space-y-2 p-3">
                {editing === q.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Soru metni</Label>
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editReq}
                        onChange={(e) => setEditReq(e.target.checked)}
                        className="h-4 w-4"
                      />
                      Zorunlu alan
                    </label>
                    <CheckGroup
                      title="Hangi kanalda sorulsun?"
                      all={VISIT_TYPES}
                      labels={VISIT_TYPE_LABELS}
                      value={editChannels}
                      onChange={setEditChannels}
                    />
                    <CheckGroup
                      title="Hangi firma türünde sorulsun?"
                      all={COMPANY_KINDS}
                      labels={COMPANY_KIND_LABELS}
                      value={editKinds}
                      onChange={setEditKinds}
                    />

                    {hasOptions && (
                      <div className="space-y-2 rounded-md border p-2">
                        <div className="text-xs font-medium text-muted-foreground">
                          Seçenekler
                        </div>
                        {q.question_options.map((o) =>
                          optEdit?.id === o.id ? (
                            <div key={o.id} className="flex flex-wrap gap-2">
                              <Input
                                className="w-40"
                                value={optEdit.value}
                                onChange={(e) =>
                                  setOptEdit({ ...optEdit, value: e.target.value })
                                }
                              />
                              <Input
                                className="flex-1"
                                value={optEdit.labelTr}
                                onChange={(e) =>
                                  setOptEdit({
                                    ...optEdit,
                                    labelTr: e.target.value,
                                  })
                                }
                              />
                              <Button
                                size="sm"
                                disabled={pending}
                                onClick={() =>
                                  run(
                                    () =>
                                      upsertOption({
                                        questionId: q.id,
                                        optionId: o.id,
                                        value: optEdit.value,
                                        labelTr: optEdit.labelTr,
                                      }),
                                    "Seçenek güncellendi"
                                  )
                                }
                              >
                                Kaydet
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setOptEdit(null)}
                              >
                                Vazgeç
                              </Button>
                            </div>
                          ) : (
                            <div
                              key={o.id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span>
                                {o.label_tr}{" "}
                                <span className="text-xs text-muted-foreground">
                                  ({o.value})
                                </span>
                              </span>
                              <span className="flex shrink-0 gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Seçeneği düzenle"
                                  onClick={() =>
                                    setOptEdit({
                                      id: o.id,
                                      value: o.value,
                                      labelTr: o.label_tr,
                                    })
                                  }
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <ConfirmButton
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive"
                                  title="Seçeneği sil"
                                  message={`"${o.label_tr}" seçeneği silinsin mi? Eski cevaplar korunur.`}
                                  confirmText="Sil"
                                  onConfirm={() =>
                                    run(
                                      () => deleteOption({ optionId: o.id }),
                                      "Seçenek silindi"
                                    )
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </ConfirmButton>
                              </span>
                            </div>
                          )
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Input
                            className="w-40"
                            placeholder="değer (kod)"
                            value={newOptValue}
                            onChange={(e) => setNewOptValue(e.target.value)}
                          />
                          <Input
                            className="flex-1"
                            placeholder="Görünen etiket"
                            value={newOptLabel}
                            onChange={(e) => setNewOptLabel(e.target.value)}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending || !newOptValue || !newOptLabel}
                            onClick={() =>
                              run(
                                async () => {
                                  const r = await upsertOption({
                                    questionId: q.id,
                                    value: newOptValue,
                                    labelTr: newOptLabel,
                                  });
                                  if (!r.error) {
                                    setNewOptValue("");
                                    setNewOptLabel("");
                                  }
                                  return r;
                                },
                                "Seçenek eklendi"
                              )
                            }
                          >
                            <Plus className="mr-1 h-4 w-4" /> Ekle
                          </Button>
                        </div>
                      </div>
                    )}

                    {err && <p className="text-sm text-destructive">{err}</p>}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(null)}
                      >
                        Kapat
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
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium">
                        <span>{q.label_tr}</span>
                        {fixed && (
                          <Badge variant="secondary" title="Sihirbazın sabit adımı">
                            <Lock className="mr-1 h-3 w-3" /> Sabit
                          </Badge>
                        )}
                        {!q.is_active && <Badge variant="secondary">Pasif</Badge>}
                        {q.is_required ? (
                          <Badge variant="warning">Zorunlu</Badge>
                        ) : (
                          <Badge variant="outline">İsteğe bağlı</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {q.code} · {TYPE_LABELS[q.input_type]} · {scopeSummary(q)}
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
                        title="Yukarı taşı"
                        disabled={pending || idx === 0}
                        onClick={() =>
                          run(() =>
                            reorderQuestion({ questionId: q.id, direction: "up" })
                          )
                        }
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Aşağı taşı"
                        disabled={pending || idx === questions.length - 1}
                        onClick={() =>
                          run(() =>
                            reorderQuestion({
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
                        title="Düzenle"
                        disabled={pending}
                        onClick={() => startEdit(q)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {!fixed && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              toggleQuestionActive({
                                questionId: q.id,
                                isActive: !q.is_active,
                              })
                            )
                          }
                        >
                          {q.is_active ? "Pasif" : "Aktif"}
                        </Button>
                      )}
                      {!fixed && (
                        <ConfirmButton
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          title="Sil"
                          message={`"${q.label_tr}" sorusu silinsin mi?`}
                          confirmText="Sil"
                          onConfirm={() =>
                            run(
                              () => deleteQuestion({ questionId: q.id }),
                              "Soru silindi"
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </ConfirmButton>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
