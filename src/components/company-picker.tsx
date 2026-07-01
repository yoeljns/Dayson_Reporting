"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { CompanySearch } from "@/components/company-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  type CompanyKind,
} from "@/lib/enums";
import { cn } from "@/lib/utils";
import { createNonCustomerCompany } from "@/app/(app)/ziyaret/actions";

export type PickedCompany = { id: string; name: string };

/** Kind toggle + search. Calls onChange with the selected company (or null). */
export function CompanyPicker({
  value,
  onChange,
  minChars = 0,
  allowCreate = false,
}: {
  value: PickedCompany | null;
  onChange: (c: PickedCompany | null) => void;
  /** Require N chars before searching (avoids dumping the whole list). */
  minChars?: number;
  /** Allow adding a new non-customer company on the fly. */
  allowCreate?: boolean;
}) {
  const [kind, setKind] = useState<CompanyKind>("distributor");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await createNonCustomerCompany({ name, city, phone });
      if (res.error || !res.id) {
        setError(res.error ?? "Firma oluşturulamadı.");
        return;
      }
      onChange({ id: res.id, name: name.trim() });
      setShowNew(false);
      setName("");
      setCity("");
      setPhone("");
    });
  }

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border p-3">
        <span className="font-medium">{value.name}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {COMPANY_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setShowNew(false);
            }}
            className={cn(
              "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium",
              kind === k
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {COMPANY_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {showNew ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="cp-name">Firma adı *</Label>
            <Input
              id="cp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Şehir"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
            <Input
              placeholder="Telefon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setShowNew(false)}
            >
              Vazgeç
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={pending || !name.trim()}
              onClick={create}
            >
              Kaydet
            </Button>
          </div>
        </div>
      ) : (
        <>
          <CompanySearch
            kind={kind}
            minChars={minChars}
            onSelect={(c) => onChange({ id: c.id, name: c.name })}
          />
          {allowCreate && kind === "non_customer" && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setShowNew(true)}
            >
              <Plus className="mr-1 h-4 w-4" /> Yeni firma ekle
            </Button>
          )}
        </>
      )}
    </div>
  );
}
