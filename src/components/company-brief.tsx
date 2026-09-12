import Link from "next/link";
import { AlertTriangle, Boxes, ClipboardList, Swords, Target, Truck } from "lucide-react";
import type { CompanyBrief as Brief, QtyLine } from "@/lib/companies/brief";
import { fmtQtyUnit, fmtUnit } from "@/lib/rules/target";
import { formatTRY } from "@/lib/utils";
import { formatTRDate, daysSince } from "@/lib/week";

const qtyList = (lines: QtyLine[], max = 4) => {
  const shown = lines.slice(0, max).map((l) => `${l.label} ${fmtUnit(l.qty, l.unit)}`);
  const rest = lines.length - shown.length;
  return shown.join(", ") + (rest > 0 ? ` +${rest}` : "");
};
const ago = (iso: string) => {
  const d = daysSince(iso);
  return d == null ? "" : d === 0 ? " (bugün)" : ` (${d} gün önce)`;
};

/**
 * Pre-visit brief rows. Empty facts are hidden so the card stays short.
 * Renders nothing when there is nothing to say.
 */
export function CompanyBrief({ brief, title = "Hazırlık" }: { brief: Brief; title?: string | null }) {
  const rows: React.ReactNode[] = [];

  if (brief.lastShipment) {
    rows.push(
      <BriefRow key="ship" icon={<Truck className="h-3.5 w-3.5" />} label="Son sevk">
        {formatTRDate(brief.lastShipment.date)}
        {ago(brief.lastShipment.date)}
        {brief.lastShipment.lines.length > 0 ? ` · ${qtyList(brief.lastShipment.lines)}` : ""}
      </BriefRow>
    );
  }
  if (brief.recent.length > 0) {
    rows.push(
      <BriefRow key="recent" icon={<Truck className="h-3.5 w-3.5" />} label="Son 3 ay">
        {qtyList(brief.recent, 5)}
      </BriefRow>
    );
  }
  if (brief.lastVisit) {
    const v = brief.lastVisit;
    rows.push(
      <BriefRow key="visit" icon={<ClipboardList className="h-3.5 w-3.5" />} label="Son ziyaret">
        <Link href={`/ziyaret/${v.id}`} className="underline-offset-2 hover:underline">
          {formatTRDate(v.date)}
        </Link>
        {ago(v.date)}
        {v.rep ? ` · ${v.rep}` : ""}
        {v.nextAction ? ` · sonraki: ${v.nextAction}${v.nextDate ? ` (${formatTRDate(v.nextDate)})` : ""}` : ""}
        {v.note && <span className="mt-0.5 line-clamp-2 block text-xs italic text-muted-foreground">“{v.note}”</span>}
      </BriefRow>
    );
  }
  if (brief.openComplaints.count > 0) {
    rows.push(
      <BriefRow key="compl" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />} label="Açık şikayet">
        <span className="font-medium">{brief.openComplaints.count}</span>
        {brief.openComplaints.titles.length > 0 ? ` · ${brief.openComplaints.titles.join("; ")}` : ""}
      </BriefRow>
    );
  }
  if (brief.target) {
    const t = brief.target;
    rows.push(
      <BriefRow key="target" icon={<Target className="h-3.5 w-3.5" />} label="Hedef">
        {t.mastikMonth
          ? `${t.mastikMonth.label} bu ay ${fmtQtyUnit(t.mastikMonth.shipped, "palet")}/${fmtQtyUnit(t.mastikMonth.target, "palet")} palet, kalan ${fmtUnit(t.mastikMonth.remaining, "palet")}`
          : ""}
        {t.behindLines.length > 0 ? (
          <span className={t.mastikMonth ? " block" : ""}>
            <span className="text-destructive">Geride:</span>{" "}
            {t.behindLines
              .slice(0, 3)
              .map((l) => `${l.label} ${fmtQtyUnit(l.shipped, l.unit)}/${fmtUnit(l.target, l.unit)}`)
              .join(", ")}
            {t.behindLines.length > 3 ? ` +${t.behindLines.length - 3}` : ""}
          </span>
        ) : !t.mastikMonth ? (
          "Yolunda"
        ) : null}
      </BriefRow>
    );
  }
  if (brief.lastStock) {
    rows.push(
      <BriefRow key="stock" icon={<Boxes className="h-3.5 w-3.5" />} label="Son stok">
        <Link href={`/stok/${brief.lastStock.id}`} className="underline-offset-2 hover:underline">
          {formatTRDate(brief.lastStock.date)}
        </Link>
        {ago(brief.lastStock.date)} · {fmtUnit(brief.lastStock.total, "palet")}
      </BriefRow>
    );
  }
  if (brief.lastCompetitor) {
    const c = brief.lastCompetitor;
    rows.push(
      <BriefRow key="comp" icon={<Swords className="h-3.5 w-3.5" />} label="Son rakip">
        <Link href={`/rakip/${c.id}`} className="underline-offset-2 hover:underline">
          {c.competitor} {c.product}
        </Link>
        {c.price != null ? ` ${formatTRY(c.price)}${c.vat === true ? " KDV dahil" : c.vat === false ? " KDV hariç" : ""}` : ""}
        {` · ${formatTRDate(c.date)}`}
      </BriefRow>
    );
  }

  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5 text-sm">
      {title && <div className="section-label">{title}</div>}
      {rows}
    </div>
  );
}

function BriefRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span>{children}</span>
      </div>
    </div>
  );
}
