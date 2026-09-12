"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CompanyPicker, type PickedCompany } from "@/components/company-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DictateButton } from "@/components/dictate-button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { PhotoUploader, type UploadedPhoto } from "@/components/photo-uploader";
import { ExtraFieldsInput } from "@/components/extra-fields";
import { useToast } from "@/components/ui/toast";
import { newId } from "@/lib/uuid";
import { complaintCode } from "@/lib/codes";
import { todayIso } from "@/lib/week";
import {
  fieldOn,
  fieldRequired,
  labelOf,
  missingRequiredField,
  type Extras,
  type FormField,
} from "@/lib/form-fields";
import { saveComplaint } from "@/app/(app)/sikayet/actions";
import { attachPhotos } from "@/app/(app)/foto/actions";
import {
  queueForm,
  queuePhotoBlob,
  isOnline,
  isNetworkError,
  OFFLINE_SAVED_MSG,
} from "@/lib/offline";

export type ComplaintFormInitial = {
  id: string;
  isDraft: boolean;
  company: PickedCompany | null;
  complainantName: string;
  complainantPhone: string;
  productCategoryId: string;
  description: string;
  detectedAt: string;
  extras: Extras;
};

export function ComplaintForm({
  fields,
  categories,
  initial,
  presetCompany,
  visitId,
  visitDate,
  returnTo,
}: {
  fields: FormField[];
  categories: { id: string; label_tr: string }[];
  /** Existing record (draft or finalized) being edited. */
  initial: ComplaintFormInitial | null;
  presetCompany: PickedCompany | null;
  visitId: string | null;
  visitDate: string | null;
  returnTo: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const today = todayIso();
  const [clientId] = useState(() => initial?.id ?? newId());
  const editId = initial?.id ?? null;
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [company, setCompany] = useState<PickedCompany | null>(initial?.company ?? presetCompany);
  const [complainantName, setComplainantName] = useState(initial?.complainantName ?? "");
  const [complainantPhone, setComplainantPhone] = useState(initial?.complainantPhone ?? "");
  const [productCategoryId, setProductCategoryId] = useState(initial?.productCategoryId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [detectedAt, setDetectedAt] = useState(initial?.detectedAt || visitDate || today);
  const [extras, setExtras] = useState<Extras>(initial?.extras ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Preset company arriving late (direct link with ?company=).
  useEffect(() => {
    if (presetCompany && !company) setCompany(presetCompany);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCompany?.id]);

  const on = (k: string) => fieldOn(fields, k);
  const req = (k: string) => fieldRequired(fields, k);
  const lbl = (k: string, fb: string) => labelOf(fields, k, fb);
  const star = (k: string) => (req(k) ? <span className="text-destructive"> *</span> : null);

  function submit(isDraft: boolean) {
    setError(null);
    if (isDraft) {
      if (!description.trim() && !company && !complainantName.trim() && !productCategoryId) {
        setError("Taslak kaydetmek için en az bir alan doldurun.");
        return;
      }
    } else {
      if (!description.trim()) return setError("Açıklama zorunludur.");
      if (on("company") && !company && !complainantName.trim())
        return setError("Şikayet eden kişiyi yazın ya da distribütör seçin.");
      const missing = missingRequiredField(
        fields,
        {
          complainant_name: complainantName.trim() || null,
          complainant_phone: complainantPhone.trim() || null,
          product_category_id: productCategoryId || null,
          description: description.trim(),
          detected_at: detectedAt,
          company: company?.id ?? null,
        },
        extras
      );
      if (missing) return setError(`"${missing.label_tr}" alanı zorunludur.`);
    }
    const input = {
      id: editId,
      clientId: editId ? null : clientId,
      companyId: company?.id ?? null,
      complainantName: complainantName || null,
      complainantPhone: complainantPhone || null,
      visitId,
      productCategoryId: productCategoryId || null,
      description,
      detectedAt,
      extras,
      isDraft,
    };
    const queue = async () => {
      await queueForm("sikayet", `Şikayet · ${company?.name ?? (complainantName || "kayıt")}`, input, {
        refTable: "complaint",
        refId: clientId,
        list: photos,
      });
      toast(OFFLINE_SAVED_MSG, "info");
      router.push(returnTo || "/sikayetler");
    };
    if (!isOnline()) {
      startTransition(queue);
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveComplaint(input);
        if (res.error || !res.id) {
          setError(res.error ?? "Şikayet kaydedilemedi.");
          return;
        }
        const uploaded = photos.filter((p) => p.status === "uploaded");
        if (uploaded.length > 0) {
          const att = await attachPhotos({
            refTable: "complaint",
            refId: res.id,
            photos: uploaded.map(({ documentId, path, mime, sizeBytes }) => ({
              documentId,
              path,
              mime,
              sizeBytes,
            })),
          });
          if (att.error) toast(`Dosyalar eklenemedi: ${att.error}`, "warn");
        }
        if (!isDraft) toast(editId && !initial?.isDraft ? "Şikayet güncellendi" : `Kayıt açıldı · ${complaintCode(res.id)}`, "ok");
        router.push(
          isDraft
            ? returnTo || "/sikayetler"
            : `/sikayet/${res.id}${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ""}`
        );
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

  const editingFinal = Boolean(editId && !initial?.isDraft);

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        {(on("complainant_name") || on("complainant_phone")) && (
          <div className="space-y-1.5">
            {on("complainant_name") && (
              <>
                <Label>
                  {lbl("complainant_name", "Şikayet eden kişi")}
                  {star("complainant_name")}
                  <span className="font-normal text-muted-foreground"> (sistemde olmak zorunda değil)</span>
                </Label>
                <Input
                  placeholder="Ad Soyad / firma"
                  value={complainantName}
                  onChange={(e) => setComplainantName(e.target.value)}
                />
              </>
            )}
            {on("complainant_phone") && (
              <Input
                placeholder={lbl("complainant_phone", "Telefon")}
                inputMode="tel"
                value={complainantPhone}
                onChange={(e) => setComplainantPhone(e.target.value)}
              />
            )}
          </div>
        )}

        {on("product_category_id") && (
          <div className="space-y-1.5">
            <Label htmlFor="product">
              {lbl("product_category_id", "Hangi ürün")}
              {star("product_category_id")}
            </Label>
            <Select id="product" value={productCategoryId} onChange={(e) => setProductCategoryId(e.target.value)}>
              <option value="">— Seçiniz —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label_tr}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="desc">
            {lbl("description", "Açıklama")}
            <span className="text-destructive"> *</span>
          </Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          <DictateButton onText={(t) => setDescription((d) => (d ? `${d} ${t}` : t))} />
        </div>

        {on("detected_at") && (
          <div className="space-y-1.5">
            <Label htmlFor="detected">
              {lbl("detected_at", "Tespit tarihi")}
              {star("detected_at")}
            </Label>
            <Input
              id="detected"
              type="date"
              max={today}
              value={detectedAt}
              onChange={(e) => setDetectedAt(e.target.value || today)}
              className="w-44"
            />
          </div>
        )}

        <ExtraFieldsInput fields={fields} value={extras} onChange={setExtras} />

        {on("company") && (
          <div className="space-y-1.5">
            <Label>
              {lbl("company", "Bağlı distribütör")}
              {star("company")}
            </Label>
            <CompanyPicker value={company} onChange={setCompany} minChars={3} allowCreate />
          </div>
        )}

        {on("photos") && (
          <div className="space-y-1.5">
            <Label>{lbl("photos", "Fotoğraf")}</Label>
            <PhotoUploader
              refTable="complaint"
              refId={clientId}
              value={photos}
              onChange={setPhotos}
              onOffline={(p) => queuePhotoBlob({ ...p, refTable: "complaint", refId: clientId })}
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          {!editingFinal && (
            <Button variant="outline" className="flex-1" disabled={pending} onClick={() => submit(true)}>
              Taslak kaydet
            </Button>
          )}
          <Button className="flex-1" disabled={pending} onClick={() => submit(false)}>
            {editingFinal ? "Kaydet" : editId ? "Şikayeti Tamamla" : "Şikayet Oluştur"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
