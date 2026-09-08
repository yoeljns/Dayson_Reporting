"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { STRUCTURAL_REQUIRED, type FormField, type FormKey } from "@/lib/form-fields";
import type { QuestionInputType } from "@/types/db";
import {
  addFormField,
  editFormField,
  toggleFormField,
  reorderFormField,
  deleteFormField,
} from "@/app/(admin)/admin/formlar/actions";

const TYPE_LABELS: Record<QuestionInputType, string> = {
  text: "Metin",
  number: "Sayı",
  boolean: "Evet / hayır",
  select: "Seçenekli",
  multiselect: "Çoklu seçim",
  date: "Tarih",
};
const NEEDS_OPTIONS: QuestionInputType[] = ["select", "multiselect"];
const HIDE_KEY = "dayson:formfields-hide-inactive";
type Result = Promise<{ ok?: boolean; error?: string }>;
type Opt = { value: string; label: string };

export function FormFieldManager({ form, fields }: { form: FormKey; fields: FormField[] }) {
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

  const inactiveCount = fields.filter((f) => !f.is_active).length;
  const visible = hideInactive ? fields.filter((f) => f.is_active) : fields;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 px-4 py-3">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={hideInactive}
              onChange={(e) => {
                setHideInactive(e.target.checked);
                try {
                  localStorage.setItem(HIDE_KEY, e.target.checked ? "1" : "0");
                } catch {
                  /* ignore */
                }
              }}
            />
            Pasifleri gizle{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
          </label>
          <Button
            size="sm"
            onClick={() => {
              setCreating((v) => !v);
              setEditing(null);
            }}
          >
            {creating ? <X className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
            {creating ? "Vazgeç" : "Yeni alan"}
          </Button>
        </div>

        {creating && (
          <div className="border-b bg-muted/20 p-4">
            <NewFieldForm
              pending={pending}
              onSubmit={(input) =>
                run(() => addFormField({ form, ...input }), "Alan eklendi", () => setCreating(false))
              }
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Alan</th>
                <th className="px-3 py-2 font-medium">Kod</th>
                <th className="px-3 py-2 font-medium">Tip</th>
                <th className="px-3 py-2 font-medium">Zorunlu</th>
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => {
                const idx = fields.findIndex((x) => x.id === f.id);
                const structural = f.is_builtin && STRUCTURAL_REQUIRED[form].includes(f.key);
                const isEditing = editing === f.id;
                return (
                  <FieldRow
                    key={f.id}
                    f={f}
                    structural={structural}
                    first={idx === 0}
                    last={idx === fields.length - 1}
                    pending={pending}
                    editing={isEditing}
                    err={isEditing ? err : null}
                    onEdit={() => {
                      setEditing(isEditing ? null : f.id);
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
  );
}

function FieldRow({
  f,
  structural,
  first,
  last,
  pending,
  editing,
  err,
  onEdit,
  run,
}: {
  f: FormField;
  structural: boolean;
  first: boolean;
  last: boolean;
  pending: boolean;
  editing: boolean;
  err: string | null;
  onEdit: () => void;
  run: (fn: () => Result, okMsg?: string, after?: () => void) => void;
}) {
  return (
    <>
      <tr className={cn("border-b align-top", !f.is_active && "text-muted-foreground")}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 text-[15px] font-medium text-foreground">
            {structural && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className={cn(!f.is_active && "text-muted-foreground")}>{f.label_tr}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {f.is_builtin ? "yerleşik" : "özel"}
            {f.options && f.options.length > 0 && ` · ${f.options.map((o) => o.label).join(", ")}`}
          </div>
        </td>
        <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{f.key}</td>
        <td className="px-3 py-3">{TYPE_LABELS[f.input_type]}</td>
        <td className="px-3 py-3">
          {f.is_required && (
            <span className="rounded bg-foreground px-2 py-0.5 text-xs font-medium text-background">
              Zorunlu alan
            </span>
          )}
        </td>
        <td className="px-3 py-3">
          {f.is_active ? <Badge variant="success">aktif</Badge> : <Badge variant="secondary">pasif</Badge>}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending || first}
              onClick={() => run(() => reorderFormField({ id: f.id, direction: "up" }))}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending || last}
              onClick={() => run(() => reorderFormField({ id: f.id, direction: "down" }))}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={onEdit}>
              {editing ? "Kapat" : "Düzenle"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || (structural && f.is_active)}
              title={structural && f.is_active ? "Bu alan olmadan form kaydedilemez" : undefined}
              onClick={() =>
                run(
                  () => toggleFormField({ id: f.id, isActive: !f.is_active }),
                  f.is_active ? "Alan pasife alındı" : "Alan aktifleştirildi"
                )
              }
            >
              {f.is_active ? "Pasif" : "Aktif"}
            </Button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="border-b bg-muted/20">
          <td colSpan={6} className="p-4">
            <FieldEditor f={f} pending={pending} err={err} run={run} onClose={onEdit} />
          </td>
        </tr>
      )}
    </>
  );
}

function OptionsEditor({ options, setOptions }: { options: Opt[]; setOptions: (o: Opt[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>Seçenekler</Label>
      {options.map((o, i) => (
        <div key={i} className="flex gap-2">
          <Input className="w-40" placeholder="kod" value={o.value}
            onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <Input placeholder="Etiket" value={o.label}
            onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, { value: "", label: "" }])}>
        <Plus className="mr-1 h-4 w-4" /> Seçenek
      </Button>
    </div>
  );
}

function FieldEditor({
  f,
  pending,
  err,
  run,
  onClose,
}: {
  f: FormField;
  pending: boolean;
  err: string | null;
  run: (fn: () => Result, okMsg?: string, after?: () => void) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(f.label_tr);
  const [required, setRequired] = useState(f.is_required);
  const [options, setOptions] = useState<Opt[]>(f.options ?? [{ value: "", label: "" }]);
  const editableOptions = !f.is_builtin && NEEDS_OPTIONS.includes(f.input_type);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Alan adı (formda görünen)</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Zorunlu alan
        </label>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending}
            onClick={() =>
              run(
                () => editFormField({ id: f.id, labelTr: label, isRequired: required, options: editableOptions ? options : undefined }),
                "Alan güncellendi",
                onClose
              )
            }>
            Kaydet
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>Vazgeç</Button>
          {!f.is_builtin && (
            <ConfirmButton size="sm" variant="ghost" className="text-destructive"
              message={`"${f.label_tr}" alanı silinsin mi? Eski kayıtlardaki cevaplar görünmez olur.`} confirmText="Sil"
              onConfirm={() => run(() => deleteFormField({ id: f.id }), "Alan silindi", onClose)}>
              <Trash2 className="mr-1 h-4 w-4" /> Sil
            </ConfirmButton>
          )}
        </div>
      </div>
      {editableOptions && (
        <div className="rounded-md border bg-card p-3">
          <OptionsEditor options={options} setOptions={setOptions} />
        </div>
      )}
    </div>
  );
}

function NewFieldForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (input: {
    key: string;
    labelTr: string;
    inputType: QuestionInputType;
    isRequired: boolean;
    options: Opt[] | null;
  }) => void;
}) {
  const [key, setKey] = useState("");
  const [labelTr, setLabelTr] = useState("");
  const [inputType, setInputType] = useState<QuestionInputType>("text");
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState<Opt[]>([{ value: "", label: "" }]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1 lg:col-span-2">
          <Label>Alan adı</Label>
          <Input value={labelTr} onChange={(e) => setLabelTr(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1">
          <Label>Kod (a-z, _)</Label>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="orn: raf_konumu" />
        </div>
        <div className="space-y-1">
          <Label>Tip</Label>
          <Select value={inputType} onChange={(e) => setInputType(e.target.value as QuestionInputType)}>
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
      {NEEDS_OPTIONS.includes(inputType) && <OptionsEditor options={options} setOptions={setOptions} />}
      <Button disabled={pending || !labelTr.trim() || !key.trim()}
        onClick={() => onSubmit({ key, labelTr, inputType, isRequired, options: NEEDS_OPTIONS.includes(inputType) ? options : null })}>
        Alan ekle
      </Button>
    </div>
  );
}
