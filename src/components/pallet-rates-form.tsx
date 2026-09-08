"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { RATE_LABELS, type PalletRates, type RateKey } from "@/lib/sales/mapping";
import { reclassifyAll, savePalletRates } from "@/app/(admin)/admin/sevkiyat/actions";

/** Koli → palet rates; saving re-computes pallet quantities of all shipments. */
export function PalletRatesForm({ rates }: { rates: PalletRates }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [vals, setVals] = useState<Record<RateKey, string>>({
    extMastik: String(rates.extMastik),
    tixo: String(rates.tixo),
    sosis: String(rates.sosis),
    bant: String(rates.bant),
  });

  function save() {
    startTransition(async () => {
      const res = await savePalletRates({
        extMastik: Number(vals.extMastik),
        tixo: Number(vals.tixo),
        sosis: Number(vals.sosis),
        bant: Number(vals.bant),
      });
      if (res.error) {
        toast(res.error, "warn");
        return;
      }
      toast(`Oranlar kaydedildi, ${res.products ?? 0} ürün yeniden hesaplandı`, "ok");
      router.refresh();
    });
  }

  function reclassify() {
    startTransition(async () => {
      const res = await reclassifyAll();
      if (res.error) {
        toast(res.error, "warn");
        return;
      }
      toast(`${res.products ?? 0} ürün yeniden eşlendi`, "ok");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(RATE_LABELS) as RateKey[]).map((k) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={`rate-${k}`}>{RATE_LABELS[k]}</Label>
            <Input
              id={`rate-${k}`}
              type="number"
              inputMode="numeric"
              min={1}
              className="h-9"
              value={vals[k]}
              disabled={pending}
              onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Zımparalar adet (koli × koli içi), pütür / soft / tabanca koli olarak sayılır; bu oranlar yalnızca
        mastik, sosis ve bant paletlerini etkiler.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={save}>
          Kaydet ve yeniden hesapla
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={reclassify}>
          Ürünleri yeniden eşle
        </Button>
      </div>
    </div>
  );
}
