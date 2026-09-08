"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CompanyPicker, type PickedCompany } from "@/components/company-picker";
import { CompetitorPicker, type PickedCompetitor } from "@/components/competitor-picker";
import { CompetitorProductChips, type PickedProduct } from "@/components/competitor-product-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PhotoUploader, type UploadedPhoto } from "@/components/photo-uploader";
import { ExtraFieldsInput } from "@/components/extra-fields";
import { useToast } from "@/components/ui/toast";
import { newId } from "@/lib/uuid";
import { cn } from "@/lib/utils";
import {
  fieldOn,
  fieldRequired,
  labelOf,
  missingRequiredField,
  type Extras,
  type FormField,
} from "@/lib/form-fields";
import { saveObservation } from "@/app/(app)/rakip/actions";
import { attachPhotos } from "@/app/(app)/foto/actions";
import {
  queueForm,
  queuePhotoBlob,
  isOnline,
  isNetworkError,
  OFFLINE_SAVED_MSG,
} from "@/lib/offline";

export type CompetitorFormInitial = {
  id: string;
  isDraft: boolean;
  competitor: PickedCompetitor | null;
  product: PickedProduct | null;
  productName: string;
  company: PickedCompany | null;
  price: string;
  priceIncludesVat: boolean | null;
  city: string;
  note: string;
  extras: Extras;
  visitId: string | null;
  observedAt: string | null;
};

export function CompetitorForm({
  fields,
  initial,
  presetCompany,
  presetCity,
  visitId,
  visitDate,
  returnTo,
}: {
  fields: FormField[];
  initial: CompetitorFormInitial | null;
  presetCompany: PickedCompany | null;
  presetCity: string | null;
  visitId: string | null;
  visitDate: string | null;
  returnTo: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [clientId, setClientId] = useState(() => initial?.id ?? newId());
  const [editId, setEditId] = useState<string | null>(initial?.id ?? null);
  const [competitor, setCompetitor] = useState<PickedCompetitor | null>(initial?.competitor ?? null);
  const [company, setCompany] = useState<PickedCompany | null>(initial?.company ?? presetCompany);
  const [product, setProduct] = useState<PickedProduct | null>(initial?.product ?? null);
  const [productName, setProductName] = useState(initial?.productName ?? "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [vat, setVat] = useState<boolean | null>(initial?.priceIncludesVat ?? null);
  const [city, setCity] = useState(initial?.city || presetCity || "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [extras, setExtras] = useState<Extras>(initial?.extras ?? {});
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const on = (k: string) => fieldOn(fields, k);
  const req = (k: string) => fieldRequired(fields, k);
  const lbl = (k: string, fb: string) => labelOf(fields, k, fb);
  const star = (k: string) => (req(k) ? <span className="text-destructive"> *</span> : null);
  const editingFinal = Boolean(editId && initial && !initial.isDraft);
  const effVisitId = visitId ?? initial?.visitId ?? null;
  const observedAt = visitDate ?? initial?.observedAt ?? null;

  function submit(isDraft: boolean) {
    setError(null);
    setSuccess(false);
    if (!competitor) return setError("Rakip seçin veya ekleyin.");
    const finalName = product ? product.name : productName.trim();
    if (!isDraft && !finalName) return setError("Ürün seçin veya adını yazın.");
    if (!isDraft) {
      const missing = missingRequiredField(
        fields,
        {
          competitor: competitor.id,
          product: finalName,
          observed_price: price === "" ? null : Number(price),
          price_includes_vat: vat == null ? null : String(vat),
          city: city || null,
          company: company?.id ?? null,
          note: note || null,
        },
        extras
      );
      if (missing) return setError(`"${missing.label_tr}" alanı zorunludur.`);
    }
    const input = {
      id: editId,
      clientId: editId ? null : clientId,
      competitorId: competitor.id,
      competitorProductId: product?.id ?? null,
      companyId: company?.id ?? null,
      visitId: effVisitId,
      productName: finalName,
      observedPrice: price === "" ? null : Number(price),
      priceIncludesVat: vat,
      city: city || null,
      note: note || null,
      extras,
      observedAt,
      isDraft,
    };
    const queue = async () => {
      await queueForm("rakip", `Rakip bilgisi · ${competitor.name}`, input, {
        refTable: "competitor_observation",
        refId: clientId,
        list: photos,
      });
      toast(OFFLINE_SAVED_MSG, "info");
      router.push(returnTo || "/rakip");
    };
    if (!isOnline()) {
      startTransition(queue);
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveObservation(input);
        if (res.error || !res.id) return setError(res.error ?? "Kaydedilemedi.");
        const uploaded = photos.filter((p) => p.status === "uploaded");
        if (uploaded.length > 0) {
          const att = await attachPhotos({
            refTable: "competitor_observation",
            refId: res.id,
            photos: uploaded.map(({ documentId, path, mime, sizeBytes }) => ({ documentId, path, mime, sizeBytes })),
          });
          if (att.error) toast(`Dosyalar eklenemedi: ${att.error}`, "warn");
        }
        // Drafts and edits go back where they came from; a fresh finalize stays
        // so the rep can log another observation quickly.
        if (isDraft || editId) {
          toast(editingFinal ? "Rakip bilgisi güncellendi" : "Kaydedildi", "ok");
          router.push(returnTo || (editingFinal ? `/rakip/${res.id}` : "/rakip"));
          router.refresh();
          return;
        }
        toast("Rakip bilgisi kaydedildi", "ok");
        setSuccess(true);
        setClientId(newId());
        setEditId(null);
        setPhotos([]);
        setProduct(null);
        setProductName("");
        setPrice("");
        setVat(null);
        setNote("");
        setExtras({});
      } catch (e) {
        if (isNetworkError(e)) {
          await queue();
          return;
        }
        setError("Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin.");
      }
    });
  }

  const chip = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-2 text-sm font-medium",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
    );

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div className="space-y-1.5">
          <Label>
            {lbl("competitor", "Rakip")}
            <span className="text-destructive"> *</span>
          </Label>
          <CompetitorPicker
            value={competitor}
            onChange={(c) => {
              setCompetitor(c);
              setProduct(null); // catalog chips belong to the competitor
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product">
            {lbl("product", "Ürün")}
            <span className="text-destructive"> *</span>
          </Label>
          {competitor && (
            <CompetitorProductChips competitorId={competitor.id} value={product} onChange={setProduct} />
          )}
          {product ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
              <span className="font-medium">{product.name}</span>
              <Badge variant="outline">Katalog</Badge>
            </div>
          ) : (
            <>
              <Input
                id="product"
                placeholder={competitor ? "Katalogda yoksa ürün adını yazın" : "Önce rakip seçin"}
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
              {productName.trim() && (
                <p className="text-xs text-muted-foreground">
                  <Badge variant="secondary">Serbest</Badge> Ofis bu ürünü daha sonra kataloğa eşleyebilir.
                </p>
              )}
            </>
          )}
        </div>

        {(on("observed_price") || on("city")) && (
          <div className="grid grid-cols-2 gap-3">
            {on("observed_price") && (
              <div className="space-y-1.5">
                <Label htmlFor="price">
                  {lbl("observed_price", "Fiyat (TL)")}
                  {star("observed_price")}
                </Label>
                <Input id="price" type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            )}
            {on("city") && (
              <div className="space-y-1.5">
                <Label htmlFor="city">
                  {lbl("city", "Şehir")}
                  {star("city")}
                </Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {on("price_includes_vat") && (
          <div className="space-y-1.5">
            <Label>
              {lbl("price_includes_vat", "KDV")}
              {star("price_includes_vat")}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={chip(vat === true)} onClick={() => setVat(vat === true ? null : true)}>
                KDV dahil
              </button>
              <button type="button" className={chip(vat === false)} onClick={() => setVat(vat === false ? null : false)}>
                KDV hariç
              </button>
              <button type="button" className={chip(vat === null)} onClick={() => setVat(null)}>
                Bilinmiyor
              </button>
            </div>
          </div>
        )}

        {on("company") && (
          <div className="space-y-1.5">
            <Label>
              {lbl("company", "Nerede görüldü (firma)")}
              {star("company")}
            </Label>
            <CompanyPicker value={company} onChange={setCompany} minChars={3} allowCreate />
          </div>
        )}

        {on("note") && (
          <div className="space-y-1.5">
            <Label htmlFor="note">
              {lbl("note", "Not")}
              {star("note")}
            </Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        )}

        <ExtraFieldsInput fields={fields} value={extras} onChange={setExtras} />

        {on("photos") && (
          <div className="space-y-1.5">
            <Label>{lbl("photos", "Fotoğraf / fiyat listesi")}</Label>
            <PhotoUploader
              refTable="competitor_observation"
              refId={clientId}
              value={photos}
              onChange={setPhotos}
              allowPdf
              onOffline={(p) => queuePhotoBlob({ ...p, refTable: "competitor_observation", refId: clientId })}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-emerald-600">Kaydedildi. Yeni gözlem ekleyebilirsiniz.</p>}

        <div className="flex gap-2">
          {!editingFinal && (
            <Button variant="outline" className="flex-1" disabled={pending || !competitor} onClick={() => submit(true)}>
              Taslak kaydet
            </Button>
          )}
          <Button className="flex-1" disabled={pending || !competitor} onClick={() => submit(false)}>
            {editingFinal ? "Kaydet" : editId ? "Tamamla" : "Kaydet"}
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => router.push(returnTo || (editingFinal && editId ? `/rakip/${editId}` : "/"))}>
          {returnTo ? "Ziyarete dön" : editingFinal ? "Vazgeç" : "Bitir"}
        </Button>
      </CardContent>
    </Card>
  );
}
