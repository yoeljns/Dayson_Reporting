"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { fmtQtyUnit, monthlyAllowance } from "@/lib/rules/target";
import { TARGET_PROPOSAL_STATUS_LABELS } from "@/lib/enums";
import { formatTRDate } from "@/lib/week";
import type { SalesCategory } from "@/types/db";
import type { TargetProposalView } from "@/lib/targets/server";
import { submitTargetProposal } from "@/app/(app)/hedef/actions";

type Row = { qty: string };
const num = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Salesperson's target proposal for an assigned dealer. Shows the live
 * (approved) target next to the proposed figure; submission waits for a
 * manager's approval and can be edited until then.
 */
export function TargetProposalForm({
  companyId,
  year,
  categories,
  current,
  latest,
}: {
  companyId: string;
  year: number;
  categories: SalesCategory[];
  /** Live target per category id. */
  current: Record<string, { target: number; monthly: number[] | null }>;
  /** This rep's newest proposal for the year (any status). */
  latest: TargetProposalView | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const editingPending = latest?.status === "bekliyor";
  const [open, setOpen] = useState(editingPending);
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const m: Record<string, Row> = {};
    for (const c of categories) {
      const prop = editingPending ? latest?.lines[c.code] : undefined;
      const src = prop
        ? { target_qty: prop.target_qty, monthly_qty: prop.monthly_qty }
        : { target_qty: current[c.id]?.target ?? 0, monthly_qty: current[c.id]?.monthly ?? null };
      const qty = c.monthly ? monthlyAllowance(src) : src.target_qty;
      m[c.id] = { qty: qty > 0 ? String(qty) : "" };
    }
    return m;
  });
  const [note, setNote] = useState(editingPending ? (latest?.note ?? "") : "");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    startTransition(async () => {
      const res = await submitTargetProposal({
        companyId,
        year,
        note,
        lines: categories.map((c) => ({
          salesCategoryId: c.id,
          targetQty: c.monthly ? num(rows[c.id].qty) * 12 : num(rows[c.id].qty),
          monthly: c.monthly ? Array(12).fill(num(rows[c.id].qty)) : null,
        })),
      });
      if (res.error) {
        setErr(res.error);
        toast(res.error, "warn");
        return;
      }
      toast("Hedef önerisi yöneticiye gönderildi", "ok");
      router.refresh();
    });
  }


  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Hedef önerisi {year}</CardTitle>
        {latest && (
          <Badge variant={latest.status === "bekliyor" ? "warning" : latest.status === "onaylandi" ? "success" : "destructive"}>
            {TARGET_PROPOSAL_STATUS_LABELS[latest.status]}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {latest?.status === "bekliyor" && (
          <p className="text-sm text-muted-foreground">
            {formatTRDate(latest.updated_at.slice(0, 10))} tarihinde gönderildi, yönetici onayı bekliyor. Onaylanana kadar
            mevcut hedef geçerli; öneriyi düzenleyip yeniden gönderebilirsiniz.
          </p>
        )}
        {latest?.status === "reddedildi" && (
          <p className="text-sm text-muted-foreground">
            Son öneri reddedildi{latest.reviewed_at ? ` (${formatTRDate(latest.reviewed_at.slice(0, 10))})` : ""}
            {latest.review_note ? `: ${latest.review_note}` : "."}
          </p>
        )}
        {latest?.status === "onaylandi" && (
          <p className="text-sm text-muted-foreground">
            Son öneri onaylandı{latest.reviewed_at ? ` (${formatTRDate(latest.reviewed_at.slice(0, 10))})` : ""}
            {latest.review_note ? `: ${latest.review_note}` : "."}
          </p>
        )}
        {!open ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {Object.values(current).some((c) => c.target > 0) ? "Hedef değişikliği öner" : "Hedef öner"}
          </Button>
        ) : (
          <>
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
                  {categories.map((c) => (
                    <ProposalRow
                      key={c.id}
                      c={c}
                      row={rows[c.id]}
                      current={
                        c.monthly
                          ? monthlyAllowance({ target_qty: current[c.id]?.target ?? 0, monthly_qty: current[c.id]?.monthly ?? null })
                          : (current[c.id]?.target ?? 0)
                      }
                      pending={pending}
                      onQty={(v) => setRows((r) => ({ ...r, [c.id]: { qty: v } }))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tp-note">Not (bayi ile konuşulan)</Label>
              <Textarea id="tp-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <div className="flex gap-2">
              <Button disabled={pending} onClick={submit}>
                <Send className="mr-1 h-4 w-4" /> {editingPending ? "Yeniden gönder" : "Yöneticiye gönder"}
              </Button>
              {!editingPending && (
                <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                  Vazgeç
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ProposalRow({
  c,
  row,
  current,
  pending,
  onQty,
}: {
  c: SalesCategory;
  row: Row;
  current: number;
  pending: boolean;
  onQty: (v: string) => void;
}) {
  return (
    <tr className="border-t">
      <td className="py-1.5 pr-2">
        {c.label_tr}
        <span className="ml-1 text-xs text-muted-foreground">{c.monthly ? `${c.unit}/ay` : c.unit}</span>
        {c.monthly && <span className="block text-xs text-muted-foreground">aylık hak</span>}
      </td>
      <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">
        {current > 0 ? fmtQtyUnit(current, c.unit) : "—"}
      </td>
      <td className="px-1 py-1.5 text-right">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={c.unit === "adet" ? 1 : 0.5}
          className="ml-auto h-9 w-24 text-right"
          value={row.qty}
          disabled={pending}
          onChange={(e) => onQty(e.target.value)}
        />
      </td>
    </tr>
  );
}
