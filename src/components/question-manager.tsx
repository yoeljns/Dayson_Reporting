"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/ui/toast";
import { isFixedQuestionCode } from "@/lib/question-codes";
import { cn } from "@/lib/utils";
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
  select: "Seçenekli",
  multiselect: "Çoklu seçim",
  boolean: "Evet / hayır",
  number: "Sayı",
  date: "Tarih",
  text: "Metin",
};
const NEEDS_OPTIONS: QuestionInputType[] = ["select", "multiselect"];
const HIDE_KEY = "dayson:questions-hide-inactive";

type Result = Promise<{ ok?: boolean; error?: string; id?: string }>;

function scopeSummary(q: QuestionWithOptions) {
  const ch =
    q.applies_to && q.applies_to.length > 0
      ? q.applies_to.map((t) => VISIT_TYPE_LABELS[t]).join(" + ")
      : null;
  const kd =
    q.applies_to_kind && q.applies_to_kind.length > 0
      ? q.applies_to_kind.map((k) => COMPANY_KIND_LABELS[k]).join(" + ")
      : null;
  return [ch, kd].filter(Boolean).join(" · ");
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
                onChange(e.target.checked ? [...value, v] : value.filter((x) => x !== v))
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

export function QuestionManager({ questions }: { questions: QuestionWithOptions[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [hideInactive, setHideInactive] = useState(false);

  useEffect(() => {
    try {
      setHideInactive(localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  function toggleHide(v: boolean) {
    setHideInactive(v);
    try {
      localStorage.setItem(HIDE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function run(fn: () => Result, okMsg?: string, after?: () => void) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setErr(res.error);
        toast(res.error, "warn");
        return;
      }
      if (okMsg) toast(okMsg, "ok");
      after?.();
      router.refresh();
    });
  }

  const inactiveCount = questions.filter((q) => !q.is_active).length;
  const visible = hideInactive ? questions.filter((q) => q.is_active) : questions;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-0">
          {/* Header bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-base font-semibold">Ziyaret soru kataloğu</span>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={hideInactive}
                  onChange={(e) => toggleHide(e.target.checked)}
                />
                Pasifleri gizle{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
              </label>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setCreating((v) => !v);
                setEditing(null);
              }}
            >
              {creating ? <X className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
              {creating ? "Vazgeç" : "Yeni soru"}
            </Button>
          </div>

          {creating && (
            <div className="border-b bg-muted/20 p-4">
              <NewQuestionForm
                pending={pending}
                onSubmit={(input) =>
                  run(() => addQuestion(input), "Soru eklendi", () => setCreating(false))
                }
              />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Soru</th>
                  <th className="px-3 py-2 font-medium">Kod</th>
                  <th className="px-3 py-2 font-medium">Tip</th>
                  <th className="px-3 py-2 font-medium">Zorunlu</th>
                  <th className="px-3 py-2 font-medium">Durum</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Gösterilecek soru yok.
                    </td>
                  </tr>
                )}
                {visible.map((q) => {
                  const fixed = isFixedQuestionCode(q.code);
                  const idx = questions.findIndex((x) => x.id === q.id);
                  const scope = scopeSummary(q);
                  const isEditing = editing === q.id;
                  return (
                    <QuestionRow
                      key={q.id}
                      q={q}
                      fixed={fixed}
                      first={idx === 0}
                      last={idx === questions.length - 1}
                      scope={scope}
                      pending={pending}
                      editing={isEditing}
                      err={isEditing ? err : null}
                      onEdit={() => {
                        setEditing(isEditing ? null : q.id);
                        setCreating(false);
                        setErr(null);
                      }}
                      run={run}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {err && !editing && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}

function QuestionRow({
  q,
  fixed,
  first,
  last,
  scope,
  pending,
  editing,
  err,
  onEdit,
  run,
}: {
  q: QuestionWithOptions;
  fixed: boolean;
  first: boolean;
  last: boolean;
  scope: string;
  pending: boolean;
  editing: boolean;
  err: string | null;
  onEdit: () => void;
  run: (fn: () => Result, okMsg?: string, after?: () => void) => void;
}) {
  return (
    <>
      <tr className={cn("border-b align-top", !q.is_active && "text-muted-foreground")}>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-medium text-foreground">
            {fixed && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className={cn(!q.is_active && "text-muted-foreground")}>{q.label_tr}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {fixed ? "sabit" : "özel"}
            {q.question_options.length > 0 &&
              ` · ${q.question_options.map((o) => o.label_tr).join(", ")}`}
            {scope && ` · ${scope}`}
          </div>
        </td>
        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{q.code}</td>
        <td className="px-3 py-3">{TYPE_LABELS[q.input_type]}</td>
        <td className="px-3 py-3">
          {q.is_required && (
            <span className="rounded bg-foreground px-2 py-0.5 text-xs font-medium text-background">
              Zorunlu alan
            </span>
          )}
        </td>
        <td className="px-3 py-3">
          {q.is_active ? (
            <Badge variant="success">aktif</Badge>
          ) : (
            <Badge variant="secondary">pasif</Badge>
          )}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Yukarı" disabled={pending || first}
              onClick={() => run(() => reorderQuestion({ questionId: q.id, direction: "up" }))}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Aşağı" disabled={pending || last}
              onClick={() => run(() => reorderQuestion({ questionId: q.id, direction: "down" }))}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={onEdit}>
              {editing ? "Kapat" : "Düzenle"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || (fixed && q.is_active)}
              title={fixed && q.is_active ? "Sabit soru pasifleştirilemez; zorunluluğunu kaldırabilirsiniz" : undefined}
              onClick={() =>
                run(
                  () => toggleQuestionActive({ questionId: q.id, isActive: !q.is_active }),
                  q.is_active ? "Soru pasife alındı" : "Soru aktifleştirildi"
                )
              }
            >
              {q.is_active ? "Pasif" : "Aktif"}
            </Button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="border-b bg-muted/20">
          <td colSpan={6} className="p-4">
            <QuestionEditor q={q} fixed={fixed} pending={pending} err={err} run={run} onClose={onEdit} />
          </td>
        </tr>
      )}
    </>
  );
}

function QuestionEditor({
  q,
  fixed,
  pending,
  err,
  run,
  onClose,
}: {
  q: QuestionWithOptions;
  fixed: boolean;
  pending: boolean;
  err: string | null;
  run: (fn: () => Result, okMsg?: string, after?: () => void) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(q.label_tr);
  const [required, setRequired] = useState(q.is_required);
  const [channels, setChannels] = useState<VisitType[]>(q.applies_to ?? []);
  const [kinds, setKinds] = useState<CompanyKind[]>(q.applies_to_kind ?? []);
  const [newOptValue, setNewOptValue] = useState("");
  const [newOptLabel, setNewOptLabel] = useState("");
  const [optEdit, setOptEdit] = useState<{ id: string; value: string; labelTr: string } | null>(null);
  const hasOptions = NEEDS_OPTIONS.includes(q.input_type);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Soru metni</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Zorunlu alan
        </label>
        <CheckGroup title="Hangi kanalda sorulsun?" all={VISIT_TYPES} labels={VISIT_TYPE_LABELS} value={channels} onChange={setChannels} />
        <CheckGroup title="Hangi firma türünde sorulsun?" all={COMPANY_KINDS} labels={COMPANY_KIND_LABELS} value={kinds} onChange={setKinds} />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  editQuestion({
                    questionId: q.id,
                    labelTr: label,
                    isRequired: required,
                    appliesTo: channels,
                    appliesToKind: kinds,
                  }),
                "Soru güncellendi",
                onClose
              )
            }
          >
            Kaydet
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            Vazgeç
          </Button>
          {!fixed && (
            <ConfirmButton
              size="sm"
              variant="ghost"
              className="text-destructive"
              message={`"${q.label_tr}" sorusu silinsin mi? Cevabı olan sorular silinemez, pasifleştirin.`}
              confirmText="Sil"
              onConfirm={() => run(() => deleteQuestion({ questionId: q.id }), "Soru silindi", onClose)}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Sil
            </ConfirmButton>
          )}
        </div>
      </div>

      {hasOptions && (
        <div className="space-y-2 rounded-md border bg-card p-3">
          <div className="text-xs font-medium text-muted-foreground">Seçenekler</div>
          {q.question_options.map((o) =>
            optEdit?.id === o.id ? (
              <div key={o.id} className="flex flex-wrap gap-2">
                <Input className="w-36" value={optEdit.value} onChange={(e) => setOptEdit({ ...optEdit, value: e.target.value })} />
                <Input className="flex-1" value={optEdit.labelTr} onChange={(e) => setOptEdit({ ...optEdit, labelTr: e.target.value })} />
                <Button size="sm" disabled={pending}
                  onClick={() => run(() => upsertOption({ questionId: q.id, optionId: o.id, value: optEdit.value, labelTr: optEdit.labelTr }), "Seçenek güncellendi", () => setOptEdit(null))}>
                  Kaydet
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOptEdit(null)}>Vazgeç</Button>
              </div>
            ) : (
              <div key={o.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {o.label_tr} <span className="text-xs text-muted-foreground">({o.value})</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOptEdit({ id: o.id, value: o.value, labelTr: o.label_tr })}>
                    Düzenle
                  </Button>
                  <ConfirmButton variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Sil"
                    message={`"${o.label_tr}" seçeneği silinsin mi? Eski cevaplar korunur.`} confirmText="Sil"
                    onConfirm={() => run(() => deleteOption({ optionId: o.id }), "Seçenek silindi")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </ConfirmButton>
                </span>
              </div>
            )
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Input className="w-36" placeholder="değer (kod)" value={newOptValue} onChange={(e) => setNewOptValue(e.target.value)} />
            <Input className="flex-1" placeholder="Görünen etiket" value={newOptLabel} onChange={(e) => setNewOptLabel(e.target.value)} />
            <Button size="sm" variant="outline" disabled={pending || !newOptValue || !newOptLabel}
              onClick={() => run(() => upsertOption({ questionId: q.id, value: newOptValue, labelTr: newOptLabel }), "Seçenek eklendi", () => { setNewOptValue(""); setNewOptLabel(""); })}>
              <Plus className="mr-1 h-4 w-4" /> Ekle
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewQuestionForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (input: {
    code: string;
    labelTr: string;
    inputType: QuestionInputType;
    isRequired: boolean;
    options: { value: string; labelTr: string }[];
  }) => void;
}) {
  const [code, setCode] = useState("");
  const [labelTr, setLabelTr] = useState("");
  const [inputType, setInputType] = useState<QuestionInputType>("select");
  const [isRequired, setIsRequired] = useState(true);
  const [options, setOptions] = useState<{ value: string; labelTr: string }[]>([{ value: "", labelTr: "" }]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="q-label">Soru metni</Label>
          <Input id="q-label" value={labelTr} onChange={(e) => setLabelTr(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor="q-code">Kod (a-z, _)</Label>
          <Input id="q-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="orn: odeme_sekli" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="q-type">Alan tipi</Label>
          <Select id="q-type" value={inputType} onChange={(e) => setInputType(e.target.value as QuestionInputType)}>
            {(Object.keys(TYPE_LABELS) as QuestionInputType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
        Zorunlu alan
      </label>
      {NEEDS_OPTIONS.includes(inputType) && (
        <div className="space-y-2">
          <Label>Seçenekler</Label>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input className="w-40" placeholder="değer (kod)" value={o.value}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              <Input placeholder="Görünen etiket" value={o.labelTr}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, labelTr: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setOptions((prev) => [...prev, { value: "", labelTr: "" }])}>
            <Plus className="mr-1 h-4 w-4" /> Seçenek ekle
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Kanal ve firma türü kısıtını ekledikten sonra &quot;Düzenle&quot; ile ayarlayın. Yeni soru listenin sonuna eklenir.
      </p>
      <Button disabled={pending || !labelTr.trim() || !code.trim()}
        onClick={() => onSubmit({ code, labelTr, inputType, isRequired, options: NEEDS_OPTIONS.includes(inputType) ? options : [] })}>
        Soru ekle
      </Button>
    </div>
  );
}
