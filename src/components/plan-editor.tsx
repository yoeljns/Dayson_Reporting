"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Send, Unlock, Building2, X } from "lucide-react";
import { CompanySearch } from "@/components/company-search";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { cn } from "@/lib/utils";
import { formatTRDate } from "@/lib/week";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  VISIT_TYPES,
  VISIT_TYPE_LABELS,
  PLAN_STATUS_LABELS,
  type CompanyKind,
  type PlanStatus,
  type VisitType,
} from "@/lib/enums";
import {
  addPlanItem,
  removePlanItem,
  updatePlanItem,
  submitPlan,
  reopenPlan,
} from "@/app/(app)/plan/actions";

type Item = {
  id: string;
  companyId: string;
  companyName: string;
  city: string | null;
  segment: string | null;
  plannedDate: string | null;
  visitType: VisitType | null;
  note: string | null;
};

export function PlanEditor({
  planId,
  status,
  note,
  dayOptions,
  items,
  lastVisit,
  readOnly,
}: {
  planId: string;
  status: PlanStatus;
  note: string | null;
  dayOptions: { iso: string; label: string }[];
  items: Item[];
  lastVisit: Record<string, string | null>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<CompanyKind>("distributor");
  const [error, setError] = useState<string | null>(null);

  const submitted = status === "gonderildi";
  const editable = !readOnly && !submitted;

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function add(companyId: string) {
    setAdding(false);
    run(() => addPlanItem({ planId, companyId }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant={submitted ? "success" : "warning"}>
          {PLAN_STATUS_LABELS[status]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {items.length} firma
        </span>
      </div>

      {/* Add a company */}
      {editable &&
        (adding ? (
          <Card>
            <CardContent className="space-y-3 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Firma ekle</span>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-2">
                {COMPANY_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium",
                      kind === k
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {COMPANY_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
              <CompanySearch kind={kind} onSelect={(c) => add(c.id)} />
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => setAdding(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Firma ekle
          </Button>
        ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Items */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Henüz firma eklenmedi.
          </p>
        ) : (
          items.map((it) => (
            <PlanItemRow
              key={it.id}
              item={it}
              planId={planId}
              dayOptions={dayOptions}
              lastVisitDate={lastVisit[it.companyId] ?? null}
              editable={editable}
              pending={pending}
              onChange={run}
            />
          ))
        )}
      </div>

      {note && !editable && (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">{note}</p>
      )}

      {/* Submit / reopen */}
      {!readOnly && (
        <div className="pt-2">
          {submitted ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() => run(() => reopenPlan(planId))}
            >
              <Unlock className="mr-2 h-4 w-4" /> Planı yeniden aç
            </Button>
          ) : (
            <ConfirmButton
              className="w-full"
              disabled={pending || items.length === 0}
              message="Plan gönderilsin mi? Gönderdikten sonra düzenlemek için yeniden açman gerekir."
              confirmText="Gönder"
              onConfirm={() => run(() => submitPlan(planId))}
            >
              <Send className="mr-2 h-4 w-4" /> Planı gönder
            </ConfirmButton>
          )}
        </div>
      )}
    </div>
  );
}

function PlanItemRow({
  item,
  planId,
  dayOptions,
  lastVisitDate,
  editable,
  pending,
  onChange,
}: {
  item: Item;
  planId: string;
  dayOptions: { iso: string; label: string }[];
  lastVisitDate: string | null;
  editable: boolean;
  pending: boolean;
  onChange: (fn: () => Promise<{ error?: string }>) => void;
}) {
  const [note, setNote] = useState(item.note ?? "");

  function patch(fields: {
    plannedDate?: string | null;
    visitType?: VisitType | null;
    note?: string | null;
  }) {
    onChange(() =>
      updatePlanItem({
        id: item.id,
        planId,
        plannedDate:
          fields.plannedDate !== undefined ? fields.plannedDate : item.plannedDate,
        visitType:
          fields.visitType !== undefined ? fields.visitType : item.visitType,
        note: fields.note !== undefined ? fields.note : item.note,
      })
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{item.companyName}</span>
              {item.segment && <Badge variant="secondary">{item.segment}</Badge>}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {item.city ? `${item.city} · ` : ""}
              Son ziyaret:{" "}
              {lastVisitDate ? formatTRDate(lastVisitDate) : "Hiç"}
            </div>
          </div>
          {editable && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onChange(() => removePlanItem({ id: item.id, planId }))}
              className="text-destructive hover:opacity-70"
              title="Çıkar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {editable ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={item.plannedDate ?? ""}
                disabled={pending}
                onChange={(e) =>
                  patch({ plannedDate: e.target.value || null })
                }
                className="h-9"
              >
                <option value="">Gün (ops.)</option>
                {dayOptions.map((d) => (
                  <option key={d.iso} value={d.iso}>
                    {d.label}
                  </option>
                ))}
              </Select>
              <Select
                value={item.visitType ?? ""}
                disabled={pending}
                onChange={(e) =>
                  patch({ visitType: (e.target.value as VisitType) || null })
                }
                className="h-9"
              >
                <option value="">Cins (ops.)</option>
                {VISIT_TYPES.map((vt) => (
                  <option key={vt} value={vt}>
                    {VISIT_TYPE_LABELS[vt]}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              placeholder="Not (ops.)"
              value={note}
              disabled={pending}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if ((item.note ?? "") !== note) patch({ note: note || null });
              }}
              className="h-9"
            />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item.plannedDate && (
              <Badge variant="outline">{formatTRDate(item.plannedDate)}</Badge>
            )}
            {item.visitType && (
              <Badge variant="outline">{VISIT_TYPE_LABELS[item.visitType]}</Badge>
            )}
            {item.note && <span>· {item.note}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
