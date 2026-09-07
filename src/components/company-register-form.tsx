"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { CompanySearch } from "@/components/company-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  FIELD_REGISTRABLE_KINDS,
  COMPANY_KIND_LABELS,
  type CompanyKind,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { newId } from "@/lib/uuid";
import { registerCompanyFromField } from "@/app/(app)/ziyaret/actions";
import {
  queueForm,
  isOnline,
  isNetworkError,
  OFFLINE_SAVED_MSG,
} from "@/lib/offline";

export type RegisteredCompany = { id: string; name: string; kind: CompanyKind };

/**
 * "Sahadan firma ekle" — registers a potential dealer, sub-dealer or
 * competitor point and assigns it to the rep. The id is generated on mount so
 * a retried / replayed submit never creates the company twice.
 */
export function CompanyRegisterForm({
  initialKind = "non_customer",
  lockKind = false,
  onCreated,
  onCancel,
  submitLabel = "Kaydet ve devam",
}: {
  initialKind?: CompanyKind;
  /** Hide the kind switch (the caller already chose it). */
  lockKind?: boolean;
  onCreated: (c: RegisteredCompany) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { toast } = useToast();
  const clientId = useMemo(() => newId(), []);
  const registrable = (FIELD_REGISTRABLE_KINDS as readonly string[]).includes(
    initialKind,
  )
    ? initialKind
    : "non_customer";
  const [kind, setKind] = useState<CompanyKind>(registrable);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [buysFrom, setBuysFrom] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [pickingDealer, setPickingDealer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const plateOk = plate === "" || /^[0-9]{2}$/.test(plate);

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Firma adı zorunludur.");
    if (!plateOk) return setError("Plaka kodu 2 haneli olmalı (örn. 34).");
    const input = {
      kind,
      name,
      city,
      plateCode: plate,
      phone,
      buysFromCompanyId: buysFrom?.id ?? null,
      notes,
      clientId,
    };
    // Offline: the company gets its client id now, so a visit/observation can
    // already reference it; the server row appears on reconnect.
    const queue = async () => {
      await queueForm("firma", `Firma · ${name.trim()}`, input);
      toast(OFFLINE_SAVED_MSG, "info");
      onCreated({ id: clientId, name: name.trim(), kind });
    };
    if (!isOnline()) {
      startTransition(queue);
      return;
    }
    startTransition(async () => {
      try {
        const res = await registerCompanyFromField(input);
        if (res.error || !res.id) {
          setError(res.error ?? "Firma kaydedilemedi.");
          return;
        }
        toast(`Firma eklendi · ${name.trim()}`, "ok");
        onCreated({ id: res.id, name: name.trim(), kind });
      } catch (e) {
        if (isNetworkError(e)) {
          await queue();
          return;
        }
        setError(
          "Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin.",
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      {!lockKind && (
        <div className="grid grid-cols-2 gap-2">
          {FIELD_REGISTRABLE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium",
                kind === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {COMPANY_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="crf-name">Firma adı *</Label>
        <Input
          id="crf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-1">
          <Label htmlFor="crf-city">İl</Label>
          <Input
            id="crf-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="crf-plate">Plaka</Label>
          <Input
            id="crf-plate"
            inputMode="numeric"
            pattern="[0-9]{2}"
            maxLength={2}
            placeholder="34"
            value={plate}
            onChange={(e) =>
              setPlate(e.target.value.replace(/\D/g, "").slice(0, 2))
            }
            className={!plateOk ? "border-destructive" : undefined}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="crf-phone">Telefon</Label>
        <Input
          id="crf-phone"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label>Hangi bayi üzerinden alıyor?</Label>
        {buysFrom ? (
          <div className="flex items-center justify-between rounded-md border p-2 text-sm">
            <span className="font-medium">{buysFrom.name}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setBuysFrom(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : pickingDealer ? (
          <div className="rounded-md border p-2">
            <CompanySearch
              kind="distributor"
              minChars={2}
              onSelect={(c) => {
                setBuysFrom({ id: c.id, name: c.name });
                setPickingDealer(false);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => setPickingDealer(false)}
            >
              Vazgeç
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setPickingDealer(true)}
          >
            Bayi seç (isteğe bağlı)
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="crf-notes">Not</Label>
        <Textarea
          id="crf-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={onCancel}
          >
            Vazgeç
          </Button>
        )}
        <Button
          type="button"
          className="flex-1"
          disabled={pending || !name.trim() || !plateOk}
          onClick={submit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
