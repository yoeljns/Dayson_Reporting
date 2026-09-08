"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { MONTHS_TR_SHORT, fmtQtyUnit } from "@/lib/rules/target";
import { formatTRDate } from "@/lib/week";
import type { SalesCategory } from "@/types/db";
import type { TargetProposalView } from "@/lib/targets/server";
import { reviewTargetProposal } from "@/app/(admin)/admin/hedefler/actions";

/** Manager's approve / reject card for a salesperson's target proposal. */
export function TargetProposalReview({
  proposal,
  categories,
  current,
}: {
  proposal: TargetProposalView;
  categories: SalesCategory[];
  /** Live target per category code. */
  current: Record<string, { target: number; monthly: number[] | null }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  function decide(decision: "onaylandi" | "reddedildi") {
    startTransition(async () => {
      const res = await reviewTargetProposal({ proposalId: proposal.id, decision, note });
      if (res.error) {
        toast(res.error, "warn");
        return;
      }
      toast(decision === "onaylandi" ? "Öneri onaylandı, hedef güncellendi" : "Öneri reddedildi", "ok");
      router.refresh();
    });
  }

  const rows = categories
    .map((c) => {
      const p = proposal.lines[c.code];
      const cur = current[c.code]?.target ?? 0;
      const next = p?.target_qty ?? 0;
      if (!p && cur === 0) return null;
      return { c, cur, next, monthly: p?.monthly_qty ?? null, changed: Math.abs(cur - next) > 0.05 };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  return (
    <Card className="border-amber-300">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Pazarlamacı hedef önerisi</CardTitle>
        <Badge variant="warning">Onay bekliyor</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {proposal.proposed_by_name ?? "Pazarlamacı"} · {formatTRDate(proposal.updated_at.slice(0, 10))}
          {proposal.note ? ` · ${proposal.note}` : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">Kategori</th>
                <th className="px-1 py-1 text-right">Mevcut</th>
                <th className="px-1 py-1 text-right">Öneri</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, cur, next, monthly, changed }) => (
                <tr key={c.id} className={changed ? "border-t font-medium" : "border-t text-muted-foreground"}>
                  <td className="py-1.5 pr-2">
                    {c.label_tr}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{c.unit}</span>
                    {monthly && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {monthly.map((v, i) => `${MONTHS_TR_SHORT[i]} ${fmtQtyUnit(v, c.unit)}`).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{cur > 0 ? fmtQtyUnit(cur, c.unit) : "—"}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{next > 0 ? fmtQtyUnit(next, c.unit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tpr-note">Karar notu (isteğe bağlı)</Label>
          <Input id="tpr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pazarlamacıya görünür" />
        </div>
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => decide("onaylandi")}>
            <Check className="mr-1 h-4 w-4" /> Onayla ve hedefe yaz
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => decide("reddedildi")}>
            <X className="mr-1 h-4 w-4" /> Reddet
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
