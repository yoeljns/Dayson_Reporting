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
  COMPLAINT_OWNER_DEPTS,
  COMPLAINT_OWNER_DEPT_LABELS,
  COMPLAINT_PRIORITIES,
  COMPLAINT_PRIORITY_LABELS,
  type ComplaintType,
  type ComplaintOwnerDept,
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
  const [type, setType] = useState<ComplaintType>("urun_hatasi");
  const [ownerDept, setOwnerDept] =
    useState<ComplaintOwnerDept>("kalite_uretim");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(2);
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
    if (!company) {
      setError("Firma seçiniz.");
      return;
    }
    startTransition(async () => {
      const res = await createComplaint({
        companyId: company.id,
        visitId,
        type,
        ownerDept,
        title,
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
            <Label>Firma *</Label>
            <CompanyPicker value={company} onChange={setCompany} />
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
            <Label htmlFor="dept">İlgili departman *</Label>
            <Select
              id="dept"
              value={ownerDept}
              onChange={(e) =>
                setOwnerDept(e.target.value as ComplaintOwnerDept)
              }
            >
              {COMPLAINT_OWNER_DEPTS.map((d) => (
                <option key={d} value={d}>
                  {COMPLAINT_OWNER_DEPT_LABELS[d]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Başlık *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button className="w-full" disabled={pending} onClick={submit}>
            Şikayet Oluştur
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
