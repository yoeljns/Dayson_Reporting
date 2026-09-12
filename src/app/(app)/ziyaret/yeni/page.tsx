"use client";

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Phone, Users, ArrowLeft, Plus } from "lucide-react";
import { CompanySearch } from "@/components/company-search";
import { CompanyRegisterForm } from "@/components/company-register-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  FIELD_REGISTRABLE_KINDS,
  VISIT_TYPES,
  VISIT_TYPE_LABELS,
  type CompanyKind,
  type VisitType,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/week";
import { createDraftVisit } from "../actions";
import { queueVisit, isOnline, isNetworkError, OFFLINE_SAVED_MSG } from "@/lib/offline";
import { newId } from "@/lib/uuid";
import { useToast } from "@/components/ui/toast";

type Selected = { id: string; name: string };

export default function NewVisitPage() {
  return (
    <Suspense>
      <NewVisitForm />
    </Suspense>
  );
}

function NewVisitForm() {
  const router = useRouter();
  const { toast } = useToast();
  const sp = useSearchParams();
  const presetCompany = sp.get("company");
  const quick = sp.get("quick") === "1";
  const presetType = (VISIT_TYPES as readonly string[]).includes(sp.get("type") ?? "")
    ? (sp.get("type") as VisitType)
    : "yuz_yuze";
  const autoStarted = useRef(false);
  const today = todayIso();
  const [kind, setKind] = useState<CompanyKind>("distributor");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [visitDate, setVisitDate] = useState(today);
  const [showNewForm, setShowNewForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canRegister = (FIELD_REGISTRABLE_KINDS as readonly string[]).includes(kind);

  // Started from a company card / today's plan → skip the search step.
  useEffect(() => {
    if (!presetCompany) return;
    const supabase = createClient();
    supabase
      .from("companies")
      .select("id, name")
      .eq("id", presetCompany)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSelected({ id: data.id as string, name: data.name as string });
      });
  }, [presetCompany]);

  // One-tap start (today's plan / nearby company): create the draft as soon
  // as the company is known, skipping the type screen.
  useEffect(() => {
    if (!quick || !selected || autoStarted.current) return;
    autoStarted.current = true;
    handlePickType(presetType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick, selected]);

  function handlePickType(visitType: VisitType) {
    if (!selected) return;
    setError(null);

    // One client id for both paths: if the online request reaches the server
    // but the reply is lost, the queued replay converges on the same visit.
    const visitId = newId();
    // Offline: queue a bare draft with a client id; the sync badge sends it
    // on reconnect and the rep continues it from "Tamamlanmamış ziyaretler".
    const queueDraft = async () => {
      await queueVisit(`Ziyaret · ${selected.name}`, {
        visitId,
        create: true,
        companyId: selected.id,
        visitType,
        visitDate,
        answers: [],
        selections: [],
        contactId: null,
        bare: true,
        complete: false,
      });
      toast(OFFLINE_SAVED_MSG, "info");
      router.push("/");
    };
    if (!isOnline()) {
      startTransition(queueDraft);
      return;
    }

    startTransition(async () => {
      try {
        const res = await createDraftVisit({
          id: visitId,
          companyId: selected.id,
          visitType,
          visitDate,
        });
        if (res.error || !res.id) {
          setError(res.error ?? "Ziyaret oluşturulamadı.");
          return;
        }
        router.push(`/ziyaret/${res.id}`);
      } catch (e) {
        if (isNetworkError(e)) await queueDraft();
        else setError("Ziyaret oluşturulamadı.");
      }
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

      <div className="grid grid-cols-3 gap-2">
        {COMPANY_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setShowNewForm(false);
            }}
            className={cn(
              "rounded-md border px-3 py-2 text-sm font-medium",
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
          {canRegister && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setShowNewForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {kind === "non_customer" ? "Yeni potansiyel bayi ekle" : "Yeni firma ekle"}
            </Button>
          )}
          {kind === "distributor" && (
            <p className="text-center text-xs text-muted-foreground">
              Bayiler ofis tarafından açılır; listede yoksa yöneticinize bildirin.
            </p>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Yeni {COMPANY_KIND_LABELS[kind]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CompanyRegisterForm
              initialKind={kind}
              lockKind
              onCancel={() => setShowNewForm(false)}
              onCreated={(c) => {
                setSelected({ id: c.id, name: c.name });
                setShowNewForm(false);
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
