"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CompanyPicker, type PickedCompany } from "@/components/company-picker";
import {
  CompetitorPicker,
  type PickedCompetitor,
} from "@/components/competitor-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createCompetitorObservation } from "../actions";

export default function NewCompetitorObservationPage() {
  return (
    <Suspense>
      <NewCompetitorObservationForm />
    </Suspense>
  );
}

function NewCompetitorObservationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const presetCompany = params.get("company");
  const visitId = params.get("visit");

  const [competitor, setCompetitor] = useState<PickedCompetitor | null>(null);
  const [company, setCompany] = useState<PickedCompany | null>(null);
  const [productName, setProductName] = useState("");
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
      .select("id, name")
      .eq("id", presetCompany)
      .single()
      .then(({ data }) => {
        if (data) setCompany({ id: data.id, name: data.name });
      });
  }, [presetCompany]);

  function submit() {
    setError(null);
    setSuccess(false);
    if (!competitor) {
      setError("Rakip seçin veya ekleyin.");
      return;
    }
    startTransition(async () => {
      const res = await createCompetitorObservation({
        competitorId: competitor.id,
        companyId: company?.id ?? null,
        visitId,
        productName,
        observedPrice: price === "" ? null : Number(price),
        city: city || null,
        note: note || null,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      setProductName("");
      setPrice("");
      setNote("");
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">Rakip Bilgisi</h1>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label>Rakip *</Label>
            <CompetitorPicker value={competitor} onChange={setCompetitor} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product">Ürün *</Label>
            <Input
              id="product"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
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
            <CompanyPicker value={company} onChange={setCompany} />
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
              onClick={() => router.push("/")}
            >
              Bitir
            </Button>
            <Button
              className="flex-1"
              disabled={pending || !competitor}
              onClick={submit}
            >
              Kaydet
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
