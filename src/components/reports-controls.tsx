"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import type { FilterKind } from "@/lib/reports";
import {
  VISIT_STATUSES,
  VISIT_STATUS_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_OWNER_DEPTS,
  COMPLAINT_OWNER_DEPT_LABELS,
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  SEGMENTS,
} from "@/lib/enums";

type Option = { id: string; name: string };

export function ReportsControls({
  reportType,
  filters,
  initial,
  salespeople,
  competitors,
}: {
  reportType: string;
  filters: FilterKind[];
  initial: {
    start: string;
    end: string;
    sp: string;
    status: string;
    dept: string;
    competitor: string;
    segment: string;
    kind: string;
  };
  salespeople: Option[];
  competitors: Option[];
}) {
  const router = useRouter();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [sp, setSp] = useState(initial.sp);
  const [status, setStatus] = useState(initial.status);
  const [dept, setDept] = useState(initial.dept);
  const [competitor, setCompetitor] = useState(initial.competitor);
  const [segment, setSegment] = useState(initial.segment);
  const [kind, setKind] = useState(initial.kind);

  const has = (k: FilterKind) => filters.includes(k);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (has("range") || has("weekrange")) {
      if (start) p.start = start;
      if (end) p.end = end;
    }
    if (has("sp") && sp) p.sp = sp;
    if ((has("vstatus") || has("cstatus")) && status) p.status = status;
    if (has("dept") && dept) p.dept = dept;
    if (has("competitor") && competitor) p.competitor = competitor;
    if (has("segment") && segment) p.segment = segment;
    if (has("kind") && kind) p.kind = kind;
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, sp, status, dept, competitor, segment, kind, reportType]);

  function apply(next: Record<string, string>) {
    const qs = new URLSearchParams({ r: reportType, ...next });
    router.push(`/admin/raporlar?${qs.toString()}`);
  }

  const singleHref = `/api/admin/raporlar?${new URLSearchParams({
    type: reportType,
    ...params,
  }).toString()}`;
  const allHref = `/api/admin/raporlar?${new URLSearchParams({
    type: "all",
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  }).toString()}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {(has("range") || has("weekrange")) && (
          <>
            <div className="space-y-1">
              <Label htmlFor="start">Başlangıç</Label>
              <Input
                id="start"
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  apply({ ...params, start: e.target.value });
                }}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="end">Bitiş</Label>
              <Input
                id="end"
                type="date"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  apply({ ...params, end: e.target.value });
                }}
                className="w-40"
              />
            </div>
          </>
        )}

        {has("sp") && (
          <div className="space-y-1">
            <Label htmlFor="sp">Pazarlamacı</Label>
            <Select
              id="sp"
              value={sp}
              onChange={(e) => {
                setSp(e.target.value);
                apply(e.target.value ? { ...params, sp: e.target.value } : omit(params, "sp"));
              }}
              className="w-52"
            >
              <option value="">Tüm pazarlamacılar</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {has("vstatus") && (
          <div className="space-y-1">
            <Label htmlFor="status">Durum</Label>
            <Select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                apply(e.target.value ? { ...params, status: e.target.value } : omit(params, "status"));
              }}
              className="w-44"
            >
              <option value="">Tümü</option>
              {VISIT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VISIT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        )}

        {has("cstatus") && (
          <div className="space-y-1">
            <Label htmlFor="status">Durum</Label>
            <Select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                apply(e.target.value ? { ...params, status: e.target.value } : omit(params, "status"));
              }}
              className="w-44"
            >
              <option value="">Tümü</option>
              {COMPLAINT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {COMPLAINT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
        )}

        {has("dept") && (
          <div className="space-y-1">
            <Label htmlFor="dept">Departman</Label>
            <Select
              id="dept"
              value={dept}
              onChange={(e) => {
                setDept(e.target.value);
                apply(e.target.value ? { ...params, dept: e.target.value } : omit(params, "dept"));
              }}
              className="w-48"
            >
              <option value="">Tümü</option>
              {COMPLAINT_OWNER_DEPTS.map((d) => (
                <option key={d} value={d}>
                  {COMPLAINT_OWNER_DEPT_LABELS[d]}
                </option>
              ))}
            </Select>
          </div>
        )}

        {has("competitor") && (
          <div className="space-y-1">
            <Label htmlFor="competitor">Rakip</Label>
            <Select
              id="competitor"
              value={competitor}
              onChange={(e) => {
                setCompetitor(e.target.value);
                apply(e.target.value ? { ...params, competitor: e.target.value } : omit(params, "competitor"));
              }}
              className="w-52"
            >
              <option value="">Tüm rakipler</option>
              {competitors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {has("segment") && (
          <div className="space-y-1">
            <Label htmlFor="segment">Segment</Label>
            <Select
              id="segment"
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value);
                apply(e.target.value ? { ...params, segment: e.target.value } : omit(params, "segment"));
              }}
              className="w-32"
            >
              <option value="">Tümü</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        )}

        {has("kind") && (
          <div className="space-y-1">
            <Label htmlFor="kind">Firma türü</Label>
            <Select
              id="kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                apply(e.target.value ? { ...params, kind: e.target.value } : omit(params, "kind"));
              }}
              className="w-48"
            >
              <option value="">Tümü</option>
              {COMPANY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {COMPANY_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={singleHref} className={buttonVariants({ variant: "default" })}>
          <Download className="mr-2 h-4 w-4" />
          {"Excel'e Aktar"}
        </a>
        <a href={allHref} className={buttonVariants({ variant: "outline" })}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Tüm raporlar (tek dosya)
        </a>
      </div>
    </div>
  );
}

function omit(obj: Record<string, string>, key: string): Record<string, string> {
  const { [key]: _removed, ...rest } = obj;
  return rest;
}
