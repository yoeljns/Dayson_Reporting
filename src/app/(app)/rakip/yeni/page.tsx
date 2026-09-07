"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CompanyPicker, type PickedCompany } from "@/components/company-picker";
import {
  CompetitorPicker,
  type PickedCompetitor,
} from "@/components/competitor-picker";
import {
  CompetitorProductChips,
  type PickedProduct,
} from "@/components/competitor-product-chips";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { newId } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { saveObservation } from "../actions";

export default function NewCompetitorObservationPage() {
  return (
    <Suspense>
      <KeyedObservationForm />
    </Suspense>
  );
}

// Remount the form when the ?draft target changes so no state leaks between a
// resumed draft and a fresh observation (same route → React would otherwise
// keep the component mounted).
function KeyedObservationForm() {
  const draftId = useSearchParams().get("draft");
  return <NewCompetitorObservationForm key={draftId ?? "new"} />;
}

function NewCompetitorObservationForm() {
  const router = useRouter();
  const { toast } = useToast();
  const params = useSearchParams();
  const presetCompany = params.get("company");
  const visitId = params.get("visit");
  const draftId = params.get("draft");
  const returnTo = params.get("return");

  // Generated once per fresh form so a retried submit never duplicates.
  const [clientId, setClientId] = useState(() => newId());
  const [editId, setEditId] = useState<string | null>(null);
  const [competitor, setCompetitor] = useState<PickedCompetitor | null>(null);
  const [company, setCompany] = useState<PickedCompany | null>(null);
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [productName, setProductName] = useState("");
  const [visitDate, setVisitDate] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [city, setCity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!presetCompany) return;
    const supabase = createClient();
    supabase
      .from("companies")
      .select("id, name, city")
      .eq("id", presetCompany)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setCompany({ id: data.id, name: data.name });
        // City comes from the company unless the rep already typed one.
        if (data.city) setCity((c) => c || (data.city as string));
      });
  }, [presetCompany]);

  // Observation logged from a visit carries that visit's date.
  useEffect(() => {
    if (!visitId) return;
    const supabase = createClient();
    supabase
      .from("visits")
      .select("visit_date")
      .eq("id", visitId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.visit_date) setVisitDate(data.visit_date as string);
      });
  }, [visitId]);

  // Resume a saved draft: load its fields into the form.
  useEffect(() => {
    if (!draftId) return;
    const supabase = createClient();
    supabase
      .from("competitor_observations")
      .select(
        "id, product_name, observed_price, city, note, competitor_id, competitor_product_id, company_id, competitors(name), companies(name), competitor_products(id, name)"
      )
      .eq("id", draftId)
      .eq("is_draft", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setEditId(data.id as string);
        setProductName((data.product_name as string | null) ?? "");
        setPrice(
          data.observed_price == null ? "" : String(data.observed_price)
        );
        setCity((data.city as string | null) ?? "");
        setNote((data.note as string | null) ?? "");
        const cp = Array.isArray(data.competitor_products)
          ? data.competitor_products[0]
          : (data.competitor_products as { id: string; name: string } | null);
        if (cp) setProduct({ id: cp.id, name: cp.name });
        const comp = Array.isArray(data.competitors)
          ? data.competitors[0]
          : (data.competitors as { name: string } | null);
        if (data.competitor_id && comp)
          setCompetitor({ id: data.competitor_id as string, name: comp.name });
        const co = Array.isArray(data.companies)
          ? data.companies[0]
          : (data.companies as { name: string } | null);
        if (data.company_id && co)
          setCompany({ id: data.company_id as string, name: co.name });
      });
  }, [draftId]);

  function submit(isDraft: boolean) {
    setError(null);
    setSuccess(false);
    if (!competitor) {
      setError("Rakip seçin veya ekleyin.");
      return;
    }
    const finalName = product ? product.name : productName.trim();
    if (!isDraft && !finalName) {
      setError("Ürün seçin veya adını yazın.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveObservation({
          id: editId,
          clientId: editId ? null : clientId,
          competitorId: competitor.id,
          competitorProductId: product?.id ?? null,
          companyId: company?.id ?? null,
          visitId,
          productName: finalName,
          observedPrice: price === "" ? null : Number(price),
          city: city || null,
          note: note || null,
          observedAt: visitDate,
          isDraft,
        });
        if (res.error || !res.id) {
          setError(res.error ?? "Kaydedilemedi.");
          return;
        }
        // Drafts and resumed records go back to the list; a fresh finalize
        // stays so the rep can log another observation quickly.
        if (isDraft || editId) {
          router.push(returnTo || "/rakip");
          return;
        }
        toast("Rakip bilgisi kaydedildi", "ok");
        setSuccess(true);
        setClientId(newId());
        setProduct(null);
        setProductName("");
        setPrice("");
        setNote("");
      } catch {
        setError(
          "Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin."
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">
        {editId ? "Rakip Bilgisi Taslağı" : "Rakip Bilgisi"}
      </h1>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label>Rakip *</Label>
            <CompetitorPicker
              value={competitor}
              onChange={(c) => {
                setCompetitor(c);
                setProduct(null); // catalog chips belong to the competitor
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product">Ürün *</Label>
            {competitor && (
              <CompetitorProductChips
                competitorId={competitor.id}
                value={product}
                onChange={setProduct}
              />
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
                  placeholder={
                    competitor ? "Katalogda yoksa ürün adını yazın" : "Önce rakip seçin"
                  }
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
                {productName.trim() && (
                  <p className="text-xs text-muted-foreground">
                    <Badge variant="secondary">Serbest</Badge> Ofis bu ürünü
                    daha sonra kataloğa eşleyebilir.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="price">Fiyat (TL)</Label>
              <Input
                id="price"
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Şehir</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nerede görüldü (firma)</Label>
            <CompanyPicker
              value={company}
              onChange={setCompany}
              minChars={3}
              allowCreate
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Not</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-emerald-600">
              Kaydedildi. Yeni gözlem ekleyebilirsiniz.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending || !competitor}
              onClick={() => submit(true)}
            >
              Taslak kaydet
            </Button>
            <Button
              className="flex-1"
              disabled={pending || !competitor}
              onClick={() => submit(false)}
            >
              {editId ? "Tamamla" : "Kaydet"}
            </Button>
          </div>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push(returnTo || "/")}
          >
            {returnTo ? "Ziyarete dön" : "Bitir"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
