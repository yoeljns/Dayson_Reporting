"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Users, ArrowLeft, Plus } from "lucide-react";
import { CompanySearch } from "@/components/company-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  VISIT_TYPES,
  VISIT_TYPE_LABELS,
  type CompanyKind,
  type VisitType,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/week";
import {
  createDraftVisit,
  createNonCustomerCompany,
} from "../actions";
import { enqueueVisit } from "@/lib/offline";

type Selected = { id: string; name: string };

export default function NewVisitPage() {
  const router = useRouter();
  const today = todayIso();
  const [kind, setKind] = useState<CompanyKind>("distributor");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [visitDate, setVisitDate] = useState(today);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreateCompany() {
    setError(null);
    startTransition(async () => {
      const res = await createNonCustomerCompany({
        name: newName,
        city: newCity,
        phone: newPhone,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Firma oluşturulamadı.");
        return;
      }
      setSelected({ id: res.id, name: newName.trim() });
      setShowNewForm(false);
    });
  }

  function handlePickType(visitType: VisitType) {
    if (!selected) return;
    setError(null);

    // Offline: queue the draft locally; OfflineSync flushes it on reconnect.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      startTransition(async () => {
        await enqueueVisit({
          companyId: selected.id,
          companyName: selected.name,
          visitType,
          visitDate,
        });
        window.dispatchEvent(new Event("dayson:offline-queue"));
        router.push("/");
      });
      return;
    }

    startTransition(async () => {
      const res = await createDraftVisit({
        companyId: selected.id,
        visitType,
        visitDate,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Ziyaret oluşturulamadı.");
        return;
      }
      router.push(`/ziyaret/${res.id}`);
    });
  }

  // Step 2: visit type
  if (selected) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Firma değiştir
        </button>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selected.name}</CardTitle>
            <p className="text-sm text-muted-foreground">Ziyaret cinsi seçin</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="visitDate">Ziyaret tarihi</Label>
              <Input
                id="visitDate"
                type="date"
                value={visitDate}
                max={today}
                onChange={(e) => setVisitDate(e.target.value || today)}
              />
              {visitDate !== today && (
                <p className="text-xs text-amber-600">
                  Geçmiş tarihli ziyaret kaydediyorsunuz.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {VISIT_TYPES.map((vt) => (
              <Button
                key={vt}
                variant="outline"
                className="h-24 flex-col gap-2"
                disabled={pending}
                onClick={() => handlePickType(vt)}
              >
                {vt === "telefon" ? (
                  <Phone className="h-7 w-7" />
                ) : (
                  <Users className="h-7 w-7" />
                )}
                <span>{VISIT_TYPE_LABELS[vt]}</span>
              </Button>
              ))}
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          Seçince taslak kaydedilir, detayları sonra tamamlayabilirsiniz.
        </p>
        {error && <p className="text-center text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // Step 1: company
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">Yeni Ziyaret</h1>

      <div className="flex gap-2">
        {COMPANY_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setShowNewForm(false);
            }}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium",
              kind === k
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {COMPANY_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {!showNewForm ? (
        <>
          <CompanySearch
            kind={kind}
            onSelect={(c) => setSelected({ id: c.id, name: c.name })}
          />
          {kind === "non_customer" && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setShowNewForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Yeni firma ekle
            </Button>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yeni Firma</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="newName">Firma adı *</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="newCity">Şehir</Label>
              <Input
                id="newCity"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="newPhone">Telefon</Label>
              <Input
                id="newPhone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowNewForm(false)}
              >
                Vazgeç
              </Button>
              <Button
                className="flex-1"
                disabled={pending || !newName.trim()}
                onClick={handleCreateCompany}
              >
                Kaydet ve devam
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
