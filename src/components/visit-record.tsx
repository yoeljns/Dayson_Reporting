import { Badge } from "@/components/ui/badge";
import { answeredQuestions } from "@/lib/answers";
import { formatTRDate } from "@/lib/week";
import {
  VISIT_TYPE_LABELS,
  VISIT_STATUS_LABELS,
  SUPPLY_KIND_LABELS,
  type VisitType,
  type VisitStatus,
  type SupplyKind,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer } from "@/types/db";

export type VisitRecordProduct = {
  categoryLabel: string;
  brandLabel: string;
  supplyKind: SupplyKind;
};

export type VisitRecordData = {
  id: string;
  visitDate: string;
  visitType: VisitType;
  status: VisitStatus;
  salesperson?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
  questions: QuestionWithOptions[];
  answers: VisitAnswer[];
  products: VisitRecordProduct[];
};

/**
 * One visit, rendered in full for reading — every answered question, the free
 * text behind "Diğer", and the product matrix. Nothing is truncated or put in
 * a fixed-height box: this is what a manager reads in a meeting, and what the
 * browser prints.
 */
export function VisitRecord({
  visit,
  showCompany = false,
  showHeader = true,
}: {
  visit: VisitRecordData;
  showCompany?: boolean;
  showHeader?: boolean;
}) {
  const rows = answeredQuestions(visit.questions, visit.answers);
  const contact = visit.contactName
    ? visit.contactRole
      ? `${visit.contactName} (${visit.contactRole})`
      : visit.contactName
    : null;

  return (
    <div className="space-y-4 leading-relaxed">
      {showHeader && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-base font-semibold">
            {formatTRDate(visit.visitDate)}
          </span>
          {showCompany && visit.companyName && (
            <span className="font-medium">{visit.companyName}</span>
          )}
          <span className="text-muted-foreground">
            {VISIT_TYPE_LABELS[visit.visitType]}
          </span>
          {visit.salesperson && (
            <span className="text-muted-foreground">{visit.salesperson}</span>
          )}
          <Badge variant={visit.status === "taslak" ? "warning" : "success"}>
            {VISIT_STATUS_LABELS[visit.status]}
          </Badge>
        </div>
      )}

      {contact && (
        <Field label="Görüşülen kişi" value={contact} />
      )}

      {rows.length === 0 ? (
        <p className="text-muted-foreground">Bu ziyarette cevap kaydedilmemiş.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ q, value, detail }) => (
            <Field
              key={q.id}
              label={q.label_tr}
              value={value ?? "—"}
              detail={detail}
            />
          ))}
        </div>
      )}

      {visit.products.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-muted-foreground">
            Ürünler / kullandığı markalar
          </div>
          <ul className="space-y-1">
            {visit.products.map((p, i) => (
              <li key={`${p.categoryLabel}-${i}`} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{p.categoryLabel}:</span>
                <span>
                  {p.supplyKind !== "brand"
                    ? SUPPLY_KIND_LABELS[p.supplyKind]
                    : p.brandLabel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Label above, full value below — long answers wrap instead of being clipped. */
function Field({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <p className="whitespace-pre-wrap font-medium">{value}</p>
      {detail && (
        <p className="whitespace-pre-wrap text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}
