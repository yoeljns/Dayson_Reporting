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
import { fmtEur, fmtQty } from "@/lib/rules/target";
import { todayIso } from "@/lib/week";
import type { TargetWithLines } from "@/lib/targets/server";
import { saveTargetLines, setTargetStatus } from "@/app/(admin)/admin/hedefler/actions";

type Cat = { id: string; label_tr: string };
type Contact = { id: string; name: string; role: string | null };
type Row = { targetQty: string; targetEur: string; actualQty: string; actualEur: string };

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

export function TargetEditor({
  target: targetProp,
  companyId,
  year,
  categories,
  contacts,
}: {
  /** null until the first save — no row is created just by opening the page. */
  target: TargetWithLines | null;
  companyId: string;
  year: number;
  categories: Cat[];
  contacts: Contact[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const target = targetProp ?? EMPTY_TARGET(companyId, year);
  const targetId = target.id || null;
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const m: Record<string, Row> = {};
    for (const c of categories) {
      const l = target.lines.find((x) => x.category_id === c.id);
      m[c.id] = {
        targetQty: l ? String(l.target_qty) : "",
        targetEur: l ? String(l.target_eur) : "",
        actualQty: l ? String(l.actual_qty) : "",
        actualEur: l ? String(l.actual_eur) : "",
      };
    }
    return m;
  });
  const [note, setNote] = useState(target.note ?? "");
  const [agreedAt, setAgreedAt] = useState(target.agreed_at ?? todayIso());
  const [agreedWith, setAgreedWith] = useState(target.agreed_with ?? "");

  const num = (s: string) => {
    const n = Number(String(s).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const totals = categories.reduce(
    (a, c) => ({
      tq: a.tq + num(rows[c.id].targetQty),
      te: a.te + num(rows[c.id].targetEur),
      aq: a.aq + num(rows[c.id].actualQty),
      ae: a.ae + num(rows[c.id].actualEur),
    }),
    { tq: 0, te: 0, aq: 0, ae: 0 }
  );

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
    run(
      () =>
        saveTargetLines({
          targetId,
          companyId,
          year,
          note,
          lines: categories.map((c) => ({
            categoryId: c.id,
            targetQty: num(rows[c.id].targetQty),
            targetEur: num(rows[c.id].targetEur),
            actualQty: num(rows[c.id].actualQty),
            actualEur: num(rows[c.id].actualEur),
          })),
        }),
      "Hedef kaydedildi"
    );
  }

  const cell = (catId: string, key: keyof Row) => (
    <Input
      type="number"
      inputMode="decimal"
      className="h-9 w-24 text-right"
      value={rows[catId][key]}
      disabled={pending}
      onChange={(e) => setRows((r) => ({ ...r, [catId]: { ...r[catId], [key]: e.target.value } }))}
    />
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Kategori hedefleri</CardTitle>
          <Badge
            variant={
              target.status === "mutabik"
                ? "success"
                : target.status === "iptal"
                  ? "secondary"
                  : "warning"
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
                  <th className="px-1 py-1 text-right">Hedef koli</th>
                  <th className="px-1 py-1 text-right">Hedef €</th>
                  <th className="px-1 py-1 text-right">Gerç. koli</th>
                  <th className="px-1 py-1 text-right">Gerç. €</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-1.5 pr-2 font-medium">{c.label_tr}</td>
                    <td className="px-1 py-1.5 text-right">{cell(c.id, "targetQty")}</td>
                    <td className="px-1 py-1.5 text-right">{cell(c.id, "targetEur")}</td>
                    <td className="px-1 py-1.5 text-right">{cell(c.id, "actualQty")}</td>
                    <td className="px-1 py-1.5 text-right">{cell(c.id, "actualEur")}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1.5 pr-2">Toplam</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtQty(totals.tq)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtEur(totals.te)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtQty(totals.aq)}</td>
                  <td className="px-1 py-1.5 text-right tabular-nums">{fmtEur(totals.ae)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Gerçekleşen değerler sipariş sisteminden gelmez; ofis muhasebe
            verisine göre elle günceller.
          </p>
          <div className="space-y-1">
            <Label htmlFor="tg-note">Not</Label>
            <Textarea id="tg-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button disabled={pending} onClick={save}>
            Kaydet
          </Button>
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
                  <Input
                    id="tg-date"
                    type="date"
                    value={agreedAt}
                    onChange={(e) => setAgreedAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tg-with">Bayi tarafında kim?</Label>
                  <Select
                    id="tg-with"
                    value={agreedWith}
                    onChange={(e) => setAgreedWith(e.target.value)}
                  >
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
                      () =>
                        setTargetStatus({
                          targetId,
                          companyId,
                          year,
                          status: "mutabik",
                          agreedAt,
                          agreedWith,
                        }),
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
                    run(
                      () =>
                        setTargetStatus({ targetId, companyId, year, status: "iptal" }),
                      "Hedef iptal edildi"
                    )
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
              onClick={() =>
                run(
                  () => setTargetStatus({ targetId, companyId, year, status: "taslak" }),
                  "Taslağa alındı"
                )
              }
            >
              Taslağa al
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
