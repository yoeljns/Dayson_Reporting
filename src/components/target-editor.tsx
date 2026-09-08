"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { TARGET_STATUS_LABELS } from "@/lib/enums";
import { fmtQtyUnit, monthlyAllowance } from "@/lib/rules/target";
import { todayIso } from "@/lib/week";
import type { SalesCategory } from "@/types/db";
import type { TargetWithLines } from "@/lib/targets/server";
import { saveTargetLines, setTargetStatus } from "@/app/(admin)/admin/hedefler/actions";

type Contact = { id: string; name: string; role: string | null };
type Row = { qty: string };

const EMPTY_TARGET = (companyId: string, year: number): TargetWithLines => ({
  id: "",
  company_id: companyId,
  year,
  status: "taslak",
  agreed_at: null,
  agreed_with: null,
  note: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  lines: [],
});

const num = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Quantity targets per sales category (unit per category). Monthly
 * categories (PU Mastik) take a monthly allowance ("her ay 15 palet"); the
 * yearly target is twelve times that. Shipped quantities are read-only — they
 * come from the weekly shipment upload.
 */
export function TargetEditor({
  target: targetProp,
  companyId,
  year,
  categories,
  contacts,
  shipped,
}: {
  target: TargetWithLines | null;
  companyId: string;
  year: number;
  categories: SalesCategory[];
  contacts: Contact[];
  /** Shipped quantity per sales category id (category unit). */
  shipped: Record<string, number>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const target = targetProp ?? EMPTY_TARGET(companyId, year);
  const targetId = target.id || null;
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const initialRows = () => {
    const m: Record<string, Row> = {};
    for (const c of categories) {
      const l = target.lines.find((x) => x.sales_category_id === c.id);
      const v = !l ? 0 : c.monthly ? monthlyAllowance(l) : Number(l.target_qty) || 0;
      m[c.id] = { qty: v > 0 ? String(v) : "" };
    }
    return m;
  };
  const [rows, setRows] = useState<Record<string, Row>>(initialRows);
  const [note, setNote] = useState(target.note ?? "");
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState(false);
  const [agreedAt, setAgreedAt] = useState(target.agreed_at ?? todayIso());
  const [agreedWith, setAgreedWith] = useState(target.agreed_with ?? "");

  const yearlyOf = (c: SalesCategory) => (c.monthly ? num(rows[c.id].qty) * 12 : num(rows[c.id].qty));

  const hasExisting = target.lines.some((l) => l.sales_category_id && Number(l.target_qty) > 0);
  const changed = categories.some((c) => {
    const l = target.lines.find((x) => x.sales_category_id === c.id);
    const prevQty = Number(l?.target_qty ?? 0);
    return Math.abs(prevQty - yearlyOf(c)) > 0.05;
  });

  function run(fn: () => Promise<{ error?: string }>, okMsg: string) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setErr(res.error);
        toast(res.error, "warn");
        return;
      }
      toast(okMsg, "ok");
      router.refresh();
    });
  }

  function save() {
    // An existing target that is being changed asks for a reason first (once).
    if (hasExisting && changed && !askReason) {
      setAskReason(true);
      return;
    }
    run(
      () =>
        saveTargetLines({
          targetId,
          companyId,
          year,
          note,
          reason: reason || null,
          lines: categories.map((c) => ({
            salesCategoryId: c.id,
            targetQty: yearlyOf(c),
            monthly: c.monthly ? Array(12).fill(num(rows[c.id].qty)) : null,
          })),
        }).then((r) => {
          if (!r.error) {
            setAskReason(false);
            setReason("");
          }
          return r;
        }),
      "Hedef kaydedildi"
    );
  }

  const setQty = (id: string, v: string) => setRows((r) => ({ ...r, [id]: { qty: v } }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Kategori hedefleri</CardTitle>
          <Badge
            variant={
              target.status === "mutabik" ? "success" : target.status === "iptal" ? "secondary" : "warning"
            }
          >
            {TARGET_STATUS_LABELS[target.status]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">Kategori</th>
                  <th className="px-1 py-1">Birim</th>
                  <th className="px-1 py-1 text-right">Hedef</th>
                  <th className="px-1 py-1 text-right">Yıllık</th>
                  <th className="px-1 py-1 text-right">Sevk edilen</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <RowGroup
                    key={c.id}
                    c={c}
                    row={rows[c.id]}
                    yearly={yearlyOf(c)}
                    shipped={shipped[c.id] ?? 0}
                    pending={pending}
                    onQty={(v) => setQty(c.id, v)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Sevk edilen miktarlar haftalık sevkiyat dosyasından gelir; burada yalnızca hedef girilir.
            PU Mastik için aylık hak girilir (örn. her ay 15 palet); yıllık hedef bunun 12 katıdır.
          </p>
          <div className="space-y-1">
            <Label htmlFor="tg-note">Not</Label>
            <Textarea id="tg-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {askReason && (
            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
              <Label htmlFor="tg-reason">Değişiklik nedeni (isteğe bağlı)</Label>
              <Input
                id="tg-reason"
                value={reason}
                placeholder="Örn. bayi ile Mart'ta yeniden anlaşıldı"
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Hedef değişiyor; eski ve yeni değerler değişiklik geçmişine yazılır.
              </p>
            </div>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={save}>
              {askReason ? "Değişikliği kaydet" : "Kaydet"}
            </Button>
            {askReason && (
              <Button variant="ghost" disabled={pending} onClick={() => setAskReason(false)}>
                Vazgeç
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Durum</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {target.status === "taslak" && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="tg-date">Mutabakat tarihi</Label>
                  <Input id="tg-date" type="date" value={agreedAt} onChange={(e) => setAgreedAt(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tg-with">Bayi tarafında kim?</Label>
                  <Select id="tg-with" value={agreedWith} onChange={(e) => setAgreedWith(e.target.value)}>
                    <option value="">—</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.role ? ` (${c.role})` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setTargetStatus({ targetId, companyId, year, status: "mutabik", agreedAt, agreedWith }),
                      "Bayiyle mutabık olarak işaretlendi"
                    )
                  }
                >
                  Bayiyle mutabık
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => setTargetStatus({ targetId, companyId, year, status: "iptal" }), "Hedef iptal edildi")
                  }
                >
                  İptal et
                </Button>
              </div>
            </>
          )}
          {target.status !== "taslak" && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setTargetStatus({ targetId, companyId, year, status: "taslak" }), "Taslağa alındı")}
            >
              Taslağa al
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RowGroup({
  c,
  row,
  yearly,
  shipped,
  pending,
  onQty,
}: {
  c: SalesCategory;
  row: Row;
  yearly: number;
  shipped: number;
  pending: boolean;
  onQty: (v: string) => void;
}) {
  return (
    <tr className="border-t">
      <td className="py-1.5 pr-2 font-medium">
        {c.label_tr}
        {c.monthly && <span className="block text-xs font-normal text-muted-foreground">aylık hak</span>}
      </td>
      <td className="px-1 py-1.5 text-xs text-muted-foreground">{c.monthly ? `${c.unit}/ay` : c.unit}</td>
      <td className="px-1 py-1.5 text-right">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={c.unit === "adet" ? 1 : 0.5}
          className="ml-auto h-9 w-28 text-right"
          value={row.qty}
          disabled={pending}
          onChange={(e) => onQty(e.target.value)}
        />
      </td>
      <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">{fmtQtyUnit(yearly, c.unit)}</td>
      <td className="px-1 py-1.5 text-right tabular-nums text-muted-foreground">{fmtQtyUnit(shipped, c.unit)}</td>
    </tr>
  );
}
