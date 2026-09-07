import { Badge } from "@/components/ui/badge";
import { PercentBar } from "@/components/ui/percent-bar";
import { PACE_LABELS, TARGET_STATUS_LABELS, type Pace } from "@/lib/enums";
import { paceOf, sumLines, fmtEur, fmtQty, type PaceResult } from "@/lib/rules/target";
import type { PaceThresholds } from "@/lib/settings";
import type { TargetWithLines } from "@/lib/targets/server";
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
 * Read-only yearly target table for one dealer (server component). Pace is
 * measured on € against the time-proportional expectation.
 */
export function TargetView({
  target,
  categories,
  elapsed,
  thresholds,
  compact = false,
}: {
  target: TargetWithLines | null;
  categories: { id: string; label_tr: string }[];
  elapsed: number;
  thresholds: PaceThresholds;
  compact?: boolean;
}) {
  if (!target || target.lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {target ? "Hedef satırı girilmemiş." : "Bu yıl için hedef girilmemiş."}
      </p>
    );
  }
  const catName = new Map(categories.map((c) => [c.id, c.label_tr]));
  const total = sumLines(target.lines);
  const totalPace = paceOf(total.actual_eur, total.target_eur, elapsed, thresholds);
  const rows = target.lines
    .map((l) => ({
      l,
      name: catName.get(l.category_id) ?? "Kategori",
      pace: paceOf(Number(l.actual_eur), Number(l.target_eur), elapsed, thresholds),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={target.status === "mutabik" ? "success" : target.status === "iptal" ? "secondary" : "warning"}>
          {TARGET_STATUS_LABELS[target.status]}
        </Badge>
        <PaceBadge pace={totalPace.pace} />
        <span className="text-muted-foreground">
          Yılın %{Math.round(elapsed * 100)}&apos;i geçti
          {target.agreed_at ? ` · mutabakat ${formatTRDate(target.agreed_at)}` : ""}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-2">Kategori</th>
              {!compact && <th className="px-2 py-1.5 text-right">Hedef koli</th>}
              <th className="px-2 py-1.5 text-right">Hedef €</th>
              {!compact && <th className="px-2 py-1.5 text-right">Gerç. koli</th>}
              <th className="px-2 py-1.5 text-right">Gerç. €</th>
              <th className="px-2 py-1.5">Gerçekleşme</th>
              <th className="py-1.5 pl-2">Tempo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ l, name, pace }) => (
              <TargetRow key={l.id} name={name} l={l} pace={pace} compact={compact} />
            ))}
            <tr className="border-t font-semibold">
              <td className="py-1.5 pr-2">Toplam</td>
              {!compact && <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(total.target_qty)}</td>}
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtEur(total.target_eur)}</td>
              {!compact && <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(total.actual_qty)}</td>}
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtEur(total.actual_eur)}</td>
              <td className="px-2 py-1.5">
                <PercentBar pct={(totalPace.ratio ?? 0) * 100} />
              </td>
              <td className="py-1.5 pl-2">
                <PaceBadge pace={totalPace.pace} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {target.note && (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{target.note}</p>
      )}
    </div>
  );
}

function TargetRow({
  name,
  l,
  pace,
  compact,
}: {
  name: string;
  l: { target_qty: number; target_eur: number; actual_qty: number; actual_eur: number };
  pace: PaceResult;
  compact: boolean;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-1.5 pr-2">{name}</td>
      {!compact && <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(l.target_qty)}</td>}
      <td className="px-2 py-1.5 text-right tabular-nums">{fmtEur(l.target_eur)}</td>
      {!compact && <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(l.actual_qty)}</td>}
      <td className="px-2 py-1.5 text-right tabular-nums">{fmtEur(l.actual_eur)}</td>
      <td className="px-2 py-1.5">
        <PercentBar pct={(pace.ratio ?? 0) * 100} />
      </td>
      <td className="py-1.5 pl-2">
        <PaceBadge pace={pace.pace} />
      </td>
    </tr>
  );
}
