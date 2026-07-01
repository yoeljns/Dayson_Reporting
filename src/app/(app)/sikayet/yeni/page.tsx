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
import { saveComplaint } from "../actions";

export default function NewComplaintPage() {
  return (
    <Suspense>
      <KeyedComplaintForm />
    </Suspense>
  );
}

// Remount the form when the ?draft target changes so no state leaks between a
// resumed draft and a fresh complaint (same route → React would otherwise keep
// the component mounted).
function KeyedComplaintForm() {
  const draftId = useSearchParams().get("draft");
  return <NewComplaintForm key={draftId ?? "new"} />;
}

function NewComplaintForm() {
  const router = useRouter();
  const params = useSearchParams();
  const presetCompany = params.get("company");
  const visitId = params.get("visit");
  const draftId = params.get("draft");

  const [editId, setEditId] = useState<string | null>(null);
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

  // Resume a saved draft: load its fields into the form.
  useEffect(() => {
    if (!draftId) return;
    const supabase = createClient();
    supabase
      .from("complaints")
      .select(
        "id, company_id, complainant_name, complainant_phone, type, product_category_id, description, priority, due_date, companies(name)"
      )
      .eq("id", draftId)
      .eq("is_draft", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setEditId(data.id as string);
        setComplainantName((data.complainant_name as string | null) ?? "");
        setComplainantPhone((data.complainant_phone as string | null) ?? "");
        setType(data.type as ComplaintType);
        setProductCategoryId((data.product_category_id as string | null) ?? "");
        setDescription((data.description as string | null) ?? "");
        setPriority((data.priority as number | null) ?? 2);
        setDueDate((data.due_date as string | null) ?? "");
        const co = Array.isArray(data.companies)
          ? data.companies[0]
          : (data.companies as { name: string } | null);
        if (data.company_id && co)
          setCompany({ id: data.company_id as string, name: co.name });
      });
  }, [draftId]);

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

  function submit(isDraft: boolean) {
    setError(null);
    if (isDraft) {
      if (
        !description.trim() &&
        !company &&
        !complainantName.trim() &&
        !productCategoryId
      ) {
        setError("Taslak kaydetmek için en az bir alan doldurun.");
        return;
      }
    } else {
      if (!description.trim()) {
        setError("Açıklama zorunludur.");
        return;
      }
      if (!company && !complainantName.trim()) {
        setError("Şikayet eden kişiyi yazın ya da en altta distribütör seçin.");
        return;
      }
    }
    startTransition(async () => {
      const res = await saveComplaint({
        id: editId,
        companyId: company?.id ?? null,
        complainantName: complainantName || null,
        complainantPhone: complainantPhone || null,
        visitId,
        type,
        productCategoryId: productCategoryId || null,
        description,
        priority,
        dueDate: dueDate || null,
        isDraft,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Şikayet kaydedilemedi.");
        return;
      }
      router.push(isDraft ? "/sikayetler" : `/sikayet/${res.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">
        {editId ? "Şikayet Taslağı" : "Yeni Şikayet"}
      </h1>

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
            <CompanyPicker
              value={company}
              onChange={setCompany}
              minChars={3}
              allowCreate
            />
            <p className="text-xs text-muted-foreground">
              Bağlıysa ilk 3 harfi yazıp distribütörü seçin; distribütör dışı yeni
              firmayı ekleyebilirsiniz.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending}
              onClick={() => submit(true)}
            >
              Taslak kaydet
            </Button>
            <Button
              className="flex-1"
              disabled={pending}
              onClick={() => submit(false)}
            >
              {editId ? "Şikayeti Tamamla" : "Şikayet Oluştur"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
