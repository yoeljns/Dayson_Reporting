import { Badge } from "@/components/ui/badge";
import { PercentBar } from "@/components/ui/percent-bar";
import { PACE_LABELS, TARGET_STATUS_LABELS, type Pace, type TargetStatus as TargetStatusKey } from "@/lib/enums";
import { MONTHS_TR_SHORT, fmtEur, fmtQtyUnit, fmtUnit, monthlyAllowance, type TargetStatus } from "@/lib/rules/target";
import type { TargetRevisionView } from "@/lib/targets/server";
import type { SalesCategory } from "@/types/db";
import { formatTRDate } from "@/lib/week";

export const PACE_BADGE: Record<Pace, "success" | "default" | "destructive"> = {
  onde: "success",
  yolunda: "default",
  geride: "destructive",
};

export function PaceBadge({ pace }: { pace: Pace | null }) {
  if (!pace) return <Badge variant="outline">Hedef yok</Badge>;
  return <Badge variant={PACE_BADGE[pace]}>{PACE_LABELS[pace]}</Badge>;
}

/**
 * Read-only target table for one dealer-year: target vs. shipped quantity per
 * sales category (in the category's unit), remaining and pace. Monthly
 * categories show the current month too. Optional change history.
 */
export function TargetView({
  status,
  target,
  compact = false,
  revisions,
  categories,
}: {
  status: TargetStatus;
  target: { status: TargetStatusKey; agreed_at: string | null; note: string | null } | null;
  compact?: boolean;
  revisions?: TargetRevisionView[];
  /** Needed to label revision entries (keyed by category code). */
  categories?: SalesCategory[];
}) {
  if (status.lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {target ? "Hedef satırı girilmemiş." : "Bu yıl için hedef girilmemiş."}
      </p>
    );
  }
  const current = status.lines.find((l) => l.month)?.month?.index ?? null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {target && (
          <Badge variant={target.status === "mutabik" ? "success" : target.status === "iptal" ? "secondary" : "warning"}>
            {TARGET_STATUS_LABELS[target.status]}
          </Badge>
        )}
        <PaceBadge pace={status.pace} />
        <span className="text-muted-foreground">
          {status.withTarget > 0 ? `${status.behind}/${status.withTarget} kategori geride` : "Hedef girilmemiş"}
          {target?.agreed_at ? ` · mutabakat ${formatTRDate(target.agreed_at)}` : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-2">Kategori</th>
              <th className="px-2 py-1.5 text-right">Hedef</th>
              <th className="px-2 py-1.5 text-right">Sevk</th>
              <th className="px-2 py-1.5 text-right">Kalan</th>
              {!compact && <th className="px-2 py-1.5">Gerçekleşme</th>}
              <th className="py-1.5 pl-2">Tempo</th>
            </tr>
          </thead>
          <tbody>
            {status.lines.map((l) => (
              <LineRows key={l.category.id} l={l} compact={compact} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Sevk edilen toplam: <span className="font-medium text-foreground">{fmtEur(status.eur)}</span>
        {current != null ? ` · bu ay: ${MONTHS_TR_SHORT[current]}` : ""}
      </p>
      {target?.note && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{target.note}</p>}
      {!compact && revisions && revisions.length > 0 && (
        <RevisionList revisions={revisions} categories={categories ?? []} />
      )}
    </div>
  );
}

function LineRows({ l, compact }: { l: TargetStatus["lines"][number]; compact: boolean }) {
  const u = l.category.unit;
  return (
    <>
      <tr className="border-b last:border-0">
        <td className="py-1.5 pr-2">
          {l.category.label_tr}
          <span className="ml-1 text-xs text-muted-foreground">{u}</span>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {l.target > 0 ? (
            l.monthly ? (
              <>
                {fmtQtyUnit(monthlyAllowance({ target_qty: l.target, monthly_qty: l.monthly }), u)}
                <span className="text-xs text-muted-foreground">/ay</span>
                <span className="block text-xs text-muted-foreground">yıl {fmtQtyUnit(l.target, u)}</span>
              </>
            ) : (
              fmtQtyUnit(l.target, u)
            )
          ) : (
            "—"
          )}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{fmtQtyUnit(l.shipped, u)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{l.target > 0 ? fmtQtyUnit(l.remaining, u) : "—"}</td>
        {!compact && (
          <td className="px-2 py-1.5">
            {l.pace.ratio != null ? <PercentBar pct={l.pace.ratio * 100} /> : null}
          </td>
        )}
        <td className="py-1.5 pl-2">
          <PaceBadge pace={l.pace.pace} />
        </td>
      </tr>
      {l.month && l.target > 0 && (
        <tr className="border-b bg-muted/30 text-xs last:border-0">
          <td colSpan={compact ? 5 : 6} className="px-2 py-1.5">
            <span className="font-medium">Bu ay ({MONTHS_TR_SHORT[l.month.index]}):</span> hak{" "}
            {fmtUnit(l.month.target, u)} · sevk {fmtUnit(l.month.shipped, u)} · kalan{" "}
            <span className={l.month.remaining > 0 ? "font-medium text-destructive" : "font-medium text-emerald-600"}>
              {fmtUnit(l.month.remaining, u)}
            </span>
            {!compact && l.monthly && (
              <div className="mt-1 grid grid-cols-6 gap-x-2 gap-y-0.5 md:grid-cols-12">
                {MONTHS_TR_SHORT.map((m, i) => (
                  <div key={m} className={i === l.month!.index ? "rounded bg-primary/10 px-1" : "px-1"}>
                    <div className="text-[10px] uppercase text-muted-foreground">{m}</div>
                    <div className={l.monthly![i] > 0 && l.byMonth[i] < l.monthly![i] && i < l.month!.index ? "tabular-nums text-destructive" : "tabular-nums"}>
                      {fmtQtyUnit(l.byMonth[i], u)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function RevisionList({ revisions, categories }: { revisions: TargetRevisionView[]; categories: SalesCategory[] }) {
  const byCode = new Map(categories.map((c) => [c.code, c]));
  return (
    <div className="space-y-2 pt-2">
      <div className="section-label">Değişiklik geçmişi</div>
      <ul className="space-y-2 text-sm">
        {revisions.map((r) => {
          const codes = Array.from(new Set([...Object.keys(r.before), ...Object.keys(r.after)])).filter((code) => {
            const a = r.before[code];
            const b = r.after[code];
            return (a?.target_qty ?? 0) !== (b?.target_qty ?? 0) || JSON.stringify(a?.monthly_qty ?? null) !== JSON.stringify(b?.monthly_qty ?? null);
          });
          return (
            <li key={r.id} className="rounded-md border p-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(r.changed_at).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" })}</span>
                {r.changed_by_name && <span>· {r.changed_by_name}</span>}
                {r.reason && <span className="text-foreground">· {r.reason}</span>}
              </div>
              <ul className="mt-1 space-y-0.5">
                {codes.map((code) => {
                  const c = byCode.get(code);
                  const unit = c?.unit ?? "koli";
                  const monthly = Boolean(c?.monthly);
                  const val = (x: { target_qty: number; monthly_qty: number[] | null } | undefined) =>
                    !x ? 0 : monthly ? monthlyAllowance(x) : x.target_qty;
                  const a = val(r.before[code]);
                  const b = val(r.after[code]);
                  return (
                    <li key={code} className="tabular-nums">
                      {c?.label_tr ?? code}: {fmtQtyUnit(a, unit)} → <span className="font-medium">{fmtQtyUnit(b, unit)}</span>{" "}
                      <span className="text-xs text-muted-foreground">{monthly ? `${unit}/ay` : unit}</span>
                    </li>
                  );
                })}
                {codes.length === 0 && <li className="text-xs text-muted-foreground">Miktar değişmedi.</li>}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
