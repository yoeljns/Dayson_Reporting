"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { CompanyPicker, type PickedCompany } from "@/components/company-picker";
import { PhotoUploader, type UploadedPhoto } from "@/components/photo-uploader";
import { useToast } from "@/components/ui/toast";
import { newId } from "@/lib/uuid";
import { formatTRDate } from "@/lib/week";
import { stockCountCode } from "@/lib/codes";
import { saveStockCount } from "@/app/(app)/stok/actions";
import { attachPhotos } from "@/app/(app)/foto/actions";

export type StockSku = { id: string; code: string; name_tr: string; category: string | null };
export type LastCount = { pallets: number; countedAt: string };

export function StockCountForm({
  skus,
  company,
  visitId,
  visitDate,
  lastByCompany,
  returnTo,
}: {
  skus: StockSku[];
  company: PickedCompany | null;
  visitId: string | null;
  visitDate: string | null;
  /** Last count per SKU for the preset company. */
  lastByCompany: Record<string, LastCount>;
  returnTo: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [clientId] = useState(() => newId());
  const [picked, setPicked] = useState<PickedCompany | null>(company);
  const [pallets, setPallets] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = useMemo(
    () => Object.values(pallets).reduce((a, b) => a + b, 0),
    [pallets]
  );

  const grouped = useMemo(() => {
    const m = new Map<string, StockSku[]>();
    for (const s of skus) {
      const k = s.category ?? "";
      (m.get(k) ?? m.set(k, []).get(k)!).push(s);
    }
    return Array.from(m.entries());
  }, [skus]);

  function submit() {
    setError(null);
    if (!picked) return setError("Bayi seçin.");
    if (total <= 0) return setError("En az bir ürün için palet girin.");
    startTransition(async () => {
      try {
        const res = await saveStockCount({
          id: clientId,
          companyId: picked.id,
          visitId,
          countedAt: visitDate,
          note,
          lines: skus
            .filter((s) => (pallets[s.id] ?? 0) > 0)
            .map((s) => ({ skuId: s.id, pallets: pallets[s.id] })),
        });
        if (res.error || !res.id) return setError(res.error ?? "Kaydedilemedi.");
        const uploaded = photos.filter((p) => p.status === "uploaded");
        if (uploaded.length > 0) {
          const att = await attachPhotos({
            refTable: "stock_count",
            refId: res.id,
            photos: uploaded.map(({ documentId, path, mime, sizeBytes }) => ({
              documentId,
              path,
              mime,
              sizeBytes,
            })),
          });
          if (att.error) toast(`Fotoğraflar eklenemedi: ${att.error}`, "warn");
        }
        toast(`Stok sayımı kaydedildi · ${stockCountCode(res.id)}`, "ok");
        router.push(returnTo || `/firma/${picked.id}?tab=stok`);
      } catch {
        setError("Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 pt-4">
        <div className="space-y-1.5">
          <Label>Bayi *</Label>
          {company ? (
            <div className="rounded-md border p-3 font-medium">{company.name}</div>
          ) : (
            <CompanyPicker
              value={picked}
              onChange={setPicked}
              minChars={2}
              kinds={["distributor"]}
            />
          )}
        </div>

        {skus.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sayım listesinde ürün yok — ofis Ürünler ekranından ekleyebilir.
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([cat, list]) => (
              <div key={cat || "_"} className="space-y-2">
                {cat && <div className="section-label">{cat}</div>}
                {list.map((s) => {
                  const last = company ? lastByCompany[s.id] : undefined;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{s.name_tr}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.code}
                          {last
                            ? ` · son sayım ${last.pallets.toLocaleString("tr-TR")} (${formatTRDate(
                                last.countedAt
                              )})`
                            : ""}
                        </div>
                      </div>
                      <Stepper
                        value={pallets[s.id] ?? 0}
                        onChange={(v) => setPallets((p) => ({ ...p, [s.id]: v }))}
                        disabled={pending}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Toplam palet</span>
              <span className="text-base font-semibold tabular-nums">
                {total.toLocaleString("tr-TR")}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="sc-note">Not</Label>
          <Textarea id="sc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Fotoğraf (depo / raf)</Label>
          <PhotoUploader
            refTable="stock_count"
            refId={clientId}
            value={photos}
            onChange={setPhotos}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="w-full"
          size="lg"
          disabled={pending || !picked || total <= 0 || skus.length === 0}
          onClick={submit}
        >
          Kaydet
        </Button>
        {returnTo && (
          <Button variant="ghost" className="w-full" onClick={() => router.push(returnTo)}>
            Ziyarete dön
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
