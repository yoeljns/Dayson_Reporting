"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { CompanySearch } from "@/components/company-search";
import { CompanyRegisterForm } from "@/components/company-register-form";
import { Button } from "@/components/ui/button";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  FIELD_REGISTRABLE_KINDS,
  type CompanyKind,
} from "@/lib/enums";
import { cn } from "@/lib/utils";

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
  /** Allow registering a new (non-dealer) company on the fly. */
  allowCreate?: boolean;
}) {
  const [kind, setKind] = useState<CompanyKind>("distributor");
  const [showNew, setShowNew] = useState(false);
  const canRegister = (FIELD_REGISTRABLE_KINDS as readonly string[]).includes(kind);

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
      <div className="grid grid-cols-2 gap-2">
        {COMPANY_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setShowNew(false);
            }}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium",
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
        <div className="rounded-md border p-3">
          <CompanyRegisterForm
            initialKind={kind}
            lockKind
            submitLabel="Kaydet"
            onCancel={() => setShowNew(false)}
            onCreated={(c) => {
              onChange({ id: c.id, name: c.name });
              setShowNew(false);
            }}
          />
        </div>
      ) : (
        <>
          <CompanySearch
            kind={kind}
            minChars={minChars}
            onSelect={(c) => onChange({ id: c.id, name: c.name })}
          />
          {allowCreate && canRegister && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setShowNew(true)}
            >
              <Plus className="mr-1 h-4 w-4" /> Yeni{" "}
              {COMPANY_KIND_LABELS[kind].toLocaleLowerCase("tr")} ekle
            </Button>
          )}
        </>
      )}
    </div>
  );
}
