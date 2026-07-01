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
  const params = useSearchParams();
  const presetCompany = params.get("company");
  const visitId = params.get("visit");
  const draftId = params.get("draft");

  const [editId, setEditId] = useState<string | null>(null);
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

  // Resume a saved draft: load its fields into the form.
  useEffect(() => {
    if (!draftId) return;
    const supabase = createClient();
    supabase
      .from("competitor_observations")
      .select(
        "id, product_name, observed_price, city, note, competitor_id, company_id, competitors(name), companies(name)"
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
    if (!isDraft && !productName.trim()) {
      setError("Ürün adı zorunludur.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveObservation({
          id: editId,
          competitorId: competitor.id,
          companyId: company?.id ?? null,
          visitId,
          productName,
          observedPrice: price === "" ? null : Number(price),
          city: city || null,
          note: note || null,
          isDraft,
        });
        if (res.error || !res.id) {
          setError(res.error ?? "Kaydedilemedi.");
          return;
        }
        // Drafts and resumed records go back to the list; a fresh finalize
        // stays so the rep can log another observation quickly.
        if (isDraft || editId) {
          router.push("/rakip");
          return;
        }
        setSuccess(true);
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
            onClick={() => router.push("/")}
          >
            Bitir
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
