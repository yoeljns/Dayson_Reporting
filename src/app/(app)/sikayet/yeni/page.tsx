"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CompanyPicker, type PickedCompany } from "@/components/company-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  COMPLAINT_TYPES,
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_PRIORITIES,
  COMPLAINT_PRIORITY_LABELS,
  type ComplaintType,
} from "@/lib/enums";
import { createComplaint } from "../actions";

export default function NewComplaintPage() {
  return (
    <Suspense>
      <NewComplaintForm />
    </Suspense>
  );
}

function NewComplaintForm() {
  const router = useRouter();
  const params = useSearchParams();
  const presetCompany = params.get("company");
  const visitId = params.get("visit");

  const [company, setCompany] = useState<PickedCompany | null>(null);
  const [complainantName, setComplainantName] = useState("");
  const [complainantPhone, setComplainantPhone] = useState("");
  const [type, setType] = useState<ComplaintType>("urun_hatasi");
  const [categories, setCategories] = useState<
    { id: string; label_tr: string }[]
  >([]);
  const [productCategoryId, setProductCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(2);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Product catalog for "hangi ürün".
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("product_categories")
      .select("id, label_tr")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) =>
        setCategories((data as { id: string; label_tr: string }[]) ?? [])
      );
  }, []);

  // Preselect the company when arriving from a visit.
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
    if (!description.trim()) {
      setError("Açıklama zorunludur.");
      return;
    }
    if (!company && !complainantName.trim()) {
      setError("Şikayet eden kişiyi yazın ya da en altta distribütör seçin.");
      return;
    }
    startTransition(async () => {
      const res = await createComplaint({
        companyId: company?.id ?? null,
        complainantName: complainantName || null,
        complainantPhone: complainantPhone || null,
        visitId,
        type,
        productCategoryId: productCategoryId || null,
        description,
        priority,
        dueDate: dueDate || null,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Şikayet oluşturulamadı.");
        return;
      }
      router.push(`/sikayet/${res.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">Yeni Şikayet</h1>

      <Card>
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label>Şikayet eden kişi (sistemde olmak zorunda değil)</Label>
            <Input
              placeholder="Ad Soyad / firma"
              value={complainantName}
              onChange={(e) => setComplainantName(e.target.value)}
            />
            <Input
              placeholder="Telefon (opsiyonel)"
              value={complainantPhone}
              onChange={(e) => setComplainantPhone(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="type">Şikayet tipi *</Label>
            <Select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as ComplaintType)}
            >
              {COMPLAINT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {COMPLAINT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product">Hangi ürün (opsiyonel)</Label>
            <Select
              id="product"
              value={productCategoryId}
              onChange={(e) => setProductCategoryId(e.target.value)}
            >
              <option value="">— Seçiniz —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label_tr}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Açıklama *</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prio">Öncelik</Label>
              <Select
                id="prio"
                value={String(priority)}
                onChange={(e) => setPriority(Number(e.target.value))}
              >
                {COMPLAINT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {COMPLAINT_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due">Termin</Label>
              <Input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Bağlı distribütör (opsiyonel)</Label>
            <CompanyPicker value={company} onChange={setCompany} minChars={3} />
            <p className="text-xs text-muted-foreground">
              Bağlıysa ilk 3 harfi yazıp distribütörü seçin.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" disabled={pending} onClick={submit}>
            Şikayet Oluştur
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
