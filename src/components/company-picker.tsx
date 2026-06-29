"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { CompanySearch } from "@/components/company-search";
import { Button } from "@/components/ui/button";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  type CompanyKind,
} from "@/lib/enums";
import { cn } from "@/lib/utils";

export type PickedCompany = { id: string; name: string };

/** Kind toggle + search. Calls onChange with the selected company (or null). */
export function CompanyPicker({
  value,
  onChange,
}: {
  value: PickedCompany | null;
  onChange: (c: PickedCompany | null) => void;
}) {
  const [kind, setKind] = useState<CompanyKind>("distributor");

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
            onClick={() => setKind(k)}
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
      <CompanySearch
        kind={kind}
        onSelect={(c) => onChange({ id: c.id, name: c.name })}
      />
    </div>
  );
}
