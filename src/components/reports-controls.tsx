"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, RotateCcw, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { todayIso, currentWeekStart, weekEndOf } from "@/lib/week";
import type { FilterKind } from "@/lib/reports";
import {
  VISIT_STATUSES,
  VISIT_STATUS_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  SEGMENTS,
} from "@/lib/enums";

type Option = { id: string; name: string };
export type ReportFilterValues = {
  start: string;
  end: string;
  sp: string;
  status: string;
  competitor: string;
  segment: string;
  kind: string;
  category: string;
  survey: string;
  year: string;
};

const EMPTY: ReportFilterValues = {
  start: "",
  end: "",
  sp: "",
  status: "",
  competitor: "",
  segment: "",
  kind: "",
  category: "",
  survey: "",
  year: "",
};

function presets(): { key: string; label: string; start: string; end: string }[] {
  const today = todayIso();
  const y = today.slice(0, 4);
  const m = today.slice(5, 7);
  const d = new Date(`${today}T00:00:00Z`);
  const threeMonths = new Date(d);
  threeMonths.setUTCMonth(threeMonths.getUTCMonth() - 3);
  const ws = currentWeekStart();
  return [
    { key: "week", label: "Bu hafta", start: ws, end: weekEndOf(ws) },
    { key: "month", label: "Bu ay", start: `${y}-${m}-01`, end: today },
    { key: "q", label: "Son 3 ay", start: threeMonths.toISOString().slice(0, 10), end: today },
    { key: "year", label: "Bu yıl", start: `${y}-01-01`, end: today },
  ];
}

/**
 * Filter panel of the reports page. Nothing is applied until "Uygula" —
 * managers set a few fields then look at the preview once.
 */
export function ReportsControls({
  reportType,
  filters,
  initial,
  defaultRangeText,
  heavy,
  salespeople,
  competitors,
  categories,
  surveys,
}: {
  reportType: string;
  filters: FilterKind[];
  initial: ReportFilterValues;
  defaultRangeText?: string;
  heavy?: boolean;
  salespeople: Option[];
  competitors: Option[];
  categories: Option[];
  surveys: Option[];
}) {
  const router = useRouter();
  const [v, setV] = useState<ReportFilterValues>(initial);
  const has = (k: FilterKind) => filters.includes(k);
  const set = (k: keyof ReportFilterValues, val: string) => setV((p) => ({ ...p, [k]: val }));

  function toParams(vals: ReportFilterValues): Record<string, string> {
    const p: Record<string, string> = {};
    if (has("range") || has("weekrange")) {
      if (vals.start) p.start = vals.start;
      if (vals.end) p.end = vals.end;
    }
    if (has("sp") && vals.sp) p.sp = vals.sp;
    if ((has("vstatus") || has("cstatus")) && vals.status) p.status = vals.status;
    if (has("competitor") && vals.competitor) p.competitor = vals.competitor;
    if (has("segment") && vals.segment) p.segment = vals.segment;
    if (has("kind") && vals.kind) p.kind = vals.kind;
    if (has("category") && vals.category) p.category = vals.category;
    if (has("survey") && vals.survey) p.survey = vals.survey;
    if (has("year") && vals.year) p.year = vals.year;
    return p;
  }

  function apply(vals: ReportFilterValues = v) {
    const qs = new URLSearchParams({ r: reportType, ...toParams(vals) });
    router.push(`/admin/raporlar?${qs.toString()}`);
  }
  function reset() {
    setV(EMPTY);
    router.push(`/admin/raporlar?r=${reportType}`);
  }

  const applied = toParams(initial);
  const activeBadges: string[] = [];
  const nameOf = (list: Option[], id: string) => list.find((o) => o.id === id)?.name ?? id;
  if (applied.start || applied.end)
    activeBadges.push(`${applied.start || "…"} – ${applied.end || "…"}`);
  if (applied.sp) activeBadges.push(nameOf(salespeople, applied.sp));
  if (applied.status)
    activeBadges.push(
      has("vstatus")
        ? VISIT_STATUS_LABELS[applied.status as keyof typeof VISIT_STATUS_LABELS] ?? applied.status
        : COMPLAINT_STATUS_LABELS[applied.status as keyof typeof COMPLAINT_STATUS_LABELS] ?? applied.status
    );
  if (applied.competitor) activeBadges.push(nameOf(competitors, applied.competitor));
  if (applied.segment) activeBadges.push(`Segment ${applied.segment}`);
  if (applied.kind) activeBadges.push(COMPANY_KIND_LABELS[applied.kind as keyof typeof COMPANY_KIND_LABELS] ?? applied.kind);
  if (applied.category) activeBadges.push(nameOf(categories, applied.category));
  if (applied.survey) activeBadges.push(nameOf(surveys, applied.survey));
  if (applied.year) activeBadges.push(`Yıl ${applied.year}`);

  const singleHref = `/api/admin/raporlar?${new URLSearchParams({ type: reportType, ...applied }).toString()}`;
  const allHref = `/api/admin/raporlar?${new URLSearchParams({
    type: "all",
    ...(applied.start ? { start: applied.start } : {}),
    ...(applied.end ? { end: applied.end } : {}),
    ...(applied.sp ? { sp: applied.sp } : {}),
  }).toString()}`;

  const thisYear = Number(todayIso().slice(0, 4));

  return (
    <div className="space-y-4">
      {(has("range") || has("weekrange")) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Hazır dönem:</span>
            {presets().map((p) => {
              const on = v.start === p.start && v.end === p.end;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    const next = { ...v, start: p.start, end: p.end };
                    setV(next);
                    apply(next);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
            {defaultRangeText && (
              <span className="text-xs text-muted-foreground">· {defaultRangeText}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {(has("range") || has("weekrange")) && (
          <>
            <Field label="Başlangıç" id="start">
              <Input id="start" type="date" value={v.start} onChange={(e) => set("start", e.target.value)} className="w-40" />
            </Field>
            <Field label="Bitiş" id="end">
              <Input id="end" type="date" value={v.end} onChange={(e) => set("end", e.target.value)} className="w-40" />
            </Field>
          </>
        )}
        {has("survey") && (
          <Field label="Özel rapor" id="survey">
            <Select id="survey" value={v.survey} onChange={(e) => set("survey", e.target.value)} className="w-64">
              <option value="">En son rapor</option>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {has("year") && (
          <Field label="Yıl" id="year">
            <Select id="year" value={v.year || String(thisYear)} onChange={(e) => set("year", e.target.value)} className="w-32">
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {has("sp") && (
          <Field label="Pazarlamacı" id="sp">
            <Select id="sp" value={v.sp} onChange={(e) => set("sp", e.target.value)} className="w-52">
              <option value="">Tüm pazarlamacılar</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {(has("vstatus") || has("cstatus")) && (
          <Field label="Durum" id="status">
            <Select id="status" value={v.status} onChange={(e) => set("status", e.target.value)} className="w-44">
              <option value="">Tümü</option>
              {has("vstatus")
                ? VISIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {VISIT_STATUS_LABELS[s]}
                    </option>
                  ))
                : COMPLAINT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {COMPLAINT_STATUS_LABELS[s]}
                    </option>
                  ))}
            </Select>
          </Field>
        )}
        {has("competitor") && (
          <Field label="Rakip" id="competitor">
            <Select id="competitor" value={v.competitor} onChange={(e) => set("competitor", e.target.value)} className="w-52">
              <option value="">Tüm rakipler</option>
              {competitors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {has("category") && (
          <Field label="Kategori" id="category">
            <Select id="category" value={v.category} onChange={(e) => set("category", e.target.value)} className="w-52">
              <option value="">Tüm kategoriler</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {has("segment") && (
          <Field label="Segment" id="segment">
            <Select id="segment" value={v.segment} onChange={(e) => set("segment", e.target.value)} className="w-32">
              <option value="">Tümü</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {has("kind") && (
          <Field label="Firma türü" id="kind">
            <Select id="kind" value={v.kind} onChange={(e) => set("kind", e.target.value)} className="w-48">
              <option value="">Tümü</option>
              {COMPANY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {COMPANY_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex gap-2">
          <Button onClick={() => apply()}>
            <Check className="mr-1 h-4 w-4" /> Uygula
          </Button>
          <Button variant="outline" onClick={reset}>
            <RotateCcw className="mr-1 h-4 w-4" /> Sıfırla
          </Button>
        </div>
      </div>

      {activeBadges.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Etkin filtreler:</span>
          {activeBadges.map((b) => (
            <Badge key={b} variant="secondary">
              {b}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <a href={singleHref} className={buttonVariants({ variant: "default" })}>
          <Download className="mr-2 h-4 w-4" />
          {"Excel'e aktar"}
        </a>
        <a href={allHref} className={buttonVariants({ variant: "outline" })}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Tüm raporlar (bu filtrelerle)
        </a>
        <span className="self-center text-xs text-muted-foreground">
          Tüm raporlar paketi tarih ve pazarlamacı süzgecini taşır
          {heavy ? "; bu ağır rapor pakette yer almaz, tek başına indirilir." : "."}
        </span>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
