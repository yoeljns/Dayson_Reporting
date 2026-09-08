"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  customFields,
  formatExtra,
  extraGiven,
  type Extras,
  type ExtraValue,
  type FormField,
} from "@/lib/form-fields";

/** Inputs for the admin-added fields of a form. */
export function ExtraFieldsInput({
  fields,
  value,
  onChange,
}: {
  fields: FormField[];
  value: Extras;
  onChange: (next: Extras) => void;
}) {
  const list = customFields(fields);
  if (list.length === 0) return null;
  const set = (k: string, v: ExtraValue) => onChange({ ...value, [k]: v });
  const chip = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-2 text-sm font-medium",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
    );
  return (
    <>
      {list.map((f) => {
        const v = value[f.key] ?? null;
        return (
          <div key={f.id} className="space-y-1.5">
            <Label htmlFor={`x-${f.key}`}>
              {f.label_tr}
              {f.is_required && <span className="text-destructive"> *</span>}
            </Label>
            {f.input_type === "boolean" ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={chip(v === true)} onClick={() => set(f.key, true)}>
                  Evet
                </button>
                <button type="button" className={chip(v === false)} onClick={() => set(f.key, false)}>
                  Hayır
                </button>
              </div>
            ) : f.input_type === "select" ? (
              <div className="flex flex-wrap gap-2">
                {(f.options ?? []).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={chip(v === o.value)}
                    onClick={() => set(f.key, v === o.value ? null : o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : f.input_type === "multiselect" ? (
              <div className="flex flex-wrap gap-2">
                {(f.options ?? []).map((o) => {
                  const picks = typeof v === "string" && v ? v.split(",") : [];
                  const on = picks.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={chip(on)}
                      onClick={() =>
                        set(
                          f.key,
                          (on ? picks.filter((p) => p !== o.value) : [...picks, o.value]).join(",") || null
                        )
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            ) : f.input_type === "number" ? (
              <Input
                id={`x-${f.key}`}
                type="number"
                inputMode="decimal"
                value={v === null || v === undefined ? "" : String(v)}
                onChange={(e) => set(f.key, e.target.value === "" ? null : Number(e.target.value))}
              />
            ) : f.input_type === "date" ? (
              <Input
                id={`x-${f.key}`}
                type="date"
                value={typeof v === "string" ? v : ""}
                onChange={(e) => set(f.key, e.target.value || null)}
              />
            ) : (
              <Textarea
                id={`x-${f.key}`}
                rows={2}
                value={typeof v === "string" ? v : ""}
                onChange={(e) => set(f.key, e.target.value || null)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/** Read-only list of extra answers (detail pages). Renders nothing when empty. */
export function ExtrasList({
  fields,
  extras,
  className,
}: {
  fields: FormField[];
  extras: Extras | null | undefined;
  className?: string;
}) {
  const rows = fields
    .filter((f) => !f.is_builtin)
    .map((f) => ({ f, v: extras?.[f.key] }))
    .filter(({ v }) => extraGiven(v));
  if (rows.length === 0) return null;
  return (
    <dl className={cn("space-y-1 text-sm", className)}>
      {rows.map(({ f, v }) => (
        <div key={f.id} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{f.label_tr}</dt>
          <dd className="text-right font-medium">{formatExtra(f, v)}</dd>
        </div>
      ))}
    </dl>
  );
}
