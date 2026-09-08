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
import { ExtraFieldsInput } from "@/components/extra-fields";
import { useToast } from "@/components/ui/toast";
import { newId } from "@/lib/uuid";
import { formatTRDate } from "@/lib/week";
import { stockCountCode } from "@/lib/codes";
import {
  fieldOn,
  fieldRequired,
  labelOf,
  missingRequiredField,
  type Extras,
  type FormField,
} from "@/lib/form-fields";
import { saveStockCount } from "@/app/(app)/stok/actions";
import { attachPhotos } from "@/app/(app)/foto/actions";
import {
  queueForm,
  queuePhotoBlob,
  isOnline,
  isNetworkError,
  OFFLINE_SAVED_MSG,
} from "@/lib/offline";

export type StockSku = { id: string; code: string; name_tr: string; category: string | null };
export type LastCount = { pallets: number; countedAt: string };
/** Existing count opened with `?edit=` — pallets keyed by sku id. */
export type StockFormInitial = {
  id: string;
  company: PickedCompany;
  pallets: Record<string, number>;
  note: string;
  extras: Extras;
  visitId: string | null;
  countedAt: string;
};

export function StockCountForm({
  skus,
  fields,
  initial,
  company,
  visitId,
  visitDate,
  lastByCompany,
  returnTo,
}: {
  skus: StockSku[];
  fields: FormField[];
  initial: StockFormInitial | null;
  company: PickedCompany | null;
  visitId: string | null;
  visitDate: string | null;
  /** Last count per SKU for the preset / edited company. */
  lastByCompany: Record<string, LastCount>;
  returnTo: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = Boolean(initial);
  const [clientId] = useState(() => initial?.id ?? newId());
  const fixedCompany = initial?.company ?? company;
  const [picked, setPicked] = useState<PickedCompany | null>(fixedCompany);
  const [pallets, setPallets] = useState<Record<string, number>>(initial?.pallets ?? {});
  const [note, setNote] = useState(initial?.note ?? "");
  const [extras, setExtras] = useState<Extras>(initial?.extras ?? {});
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const on = (k: string) => fieldOn(fields, k);
  const lbl = (k: string, fb: string) => labelOf(fields, k, fb);
  const star = (k: string) =>
    fieldRequired(fields, k) ? <span className="text-destructive"> *</span> : null;
  const effVisitId = visitId ?? initial?.visitId ?? null;
  const countedAt = visitDate ?? initial?.countedAt ?? null;

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
    const missing = missingRequiredField(
      fields,
      { company: picked.id, lines: total, note: note || null },
      extras
    );
    if (missing) return setError(`"${missing.label_tr}" alanı zorunludur.`);
    const input = {
      id: clientId,
      companyId: picked.id,
      visitId: effVisitId,
      countedAt,
      note,
      extras,
      lines: skus
        .filter((s) => (pallets[s.id] ?? 0) > 0)
        .map((s) => ({ skuId: s.id, pallets: pallets[s.id] })),
    };
    const done = (id: string) => returnTo || (editing ? `/stok/${id}` : `/firma/${picked.id}?tab=stok`);
    const queue = async () => {
      await queueForm("stok", `Stok sayımı · ${picked.name}`, input, {
        refTable: "stock_count",
        refId: clientId,
        list: photos,
      });
      toast(OFFLINE_SAVED_MSG, "info");
      router.push(returnTo || (editing ? `/stok/${clientId}` : "/"));
    };
    if (!isOnline()) {
      startTransition(queue);
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveStockCount(input);
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
        toast(
          editing
            ? `Stok sayımı güncellendi · ${stockCountCode(res.id)}`
            : `Stok sayımı kaydedildi · ${stockCountCode(res.id)}`,
          "ok"
        );
        router.push(done(res.id));
        router.refresh();
      } catch (e) {
        if (isNetworkError(e)) {
          await queue();
          return;
        }
        setError("Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin.");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 pt-4">
        <div className="space-y-1.5">
          <Label>
            {lbl("company", "Bayi")}
            <span className="text-destructive"> *</span>
          </Label>
          {fixedCompany ? (
            <div className="rounded-md border p-3 font-medium">{fixedCompany.name}</div>
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
            <div className="section-label">{lbl("lines", "Palet sayımı")}</div>
            {grouped.map(([cat, list]) => (
              <div key={cat || "_"} className="space-y-2">
                {cat && <div className="text-xs font-medium text-muted-foreground">{cat}</div>}
                {list.map((s) => {
                  const last = lastByCompany[s.id];
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

        {on("note") && (
          <div className="space-y-1.5">
            <Label htmlFor="sc-note">
              {lbl("note", "Not")}
              {star("note")}
            </Label>
            <Textarea id="sc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}

        <ExtraFieldsInput fields={fields} value={extras} onChange={setExtras} />

        {on("photos") && (
          <div className="space-y-1.5">
            <Label>{lbl("photos", "Fotoğraf (depo / raf)")}</Label>
            {editing && (
              <p className="text-xs text-muted-foreground">
                Mevcut fotoğraflar sayım sayfasında görünür; burada yeni fotoğraf ekleyebilirsiniz.
              </p>
            )}
            <PhotoUploader
              refTable="stock_count"
              refId={clientId}
              value={photos}
              onChange={setPhotos}
              onOffline={(p) =>
                queuePhotoBlob({ ...p, refTable: "stock_count", refId: clientId })
              }
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="w-full"
          size="lg"
          disabled={pending || !picked || total <= 0 || skus.length === 0}
          onClick={submit}
        >
          Kaydet
        </Button>
        {(returnTo || editing) && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(returnTo || `/stok/${clientId}`)}
          >
            {returnTo ? "Ziyarete dön" : "Vazgeç"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
