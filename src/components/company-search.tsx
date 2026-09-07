"use client";

import { useEffect, useState } from "react";
import { Search, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { COMPANY_KIND_LABELS, type CompanyKind } from "@/lib/enums";
import type { Company } from "@/types/db";

type Hit = Pick<
  Company,
  "id" | "name" | "kind" | "city" | "segment" | "logo_code" | "plate_code"
>;

export function CompanySearch({
  kind,
  onSelect,
  minChars = 0,
}: {
  kind: CompanyKind;
  onSelect: (company: Hit) => void;
  /** Require at least this many characters before searching (0 = search all). */
  minChars?: number;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  const tooShort = term.trim().length < minChars;

  useEffect(() => {
    // Below the threshold: don't query and don't dump the whole list.
    if (term.trim().length < minChars) {
      setResults([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      let query = supabase
        .from("companies")
        .select("id, name, kind, city, segment, logo_code, plate_code")
        .eq("kind", kind)
        .is("deleted_at", null)
        .order("name")
        .limit(25);
      if (term.trim()) query = query.ilike("name", `%${term.trim()}%`);
      const { data } = await query;
      if (!cancelled) {
        setResults((data as Hit[]) ?? []);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, kind, minChars]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder={
            kind === "other" ? "Diğer firma ara… (isim)" : `${COMPANY_KIND_LABELS[kind]} ara… (isim)`
          }
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {loading && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            Aranıyor…
          </p>
        )}
        {!loading && tooShort && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            Aramak için en az {minChars} harf girin.
          </p>
        )}
        {!loading && !tooShort && results.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            Sonuç bulunamadı.
          </p>
        )}
        {results.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="flex w-full items-center justify-between rounded-md border p-3 text-left hover:bg-accent"
          >
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[
                    c.plate_code ? `${c.plate_code} ${c.city ?? ""}`.trim() : c.city,
                    c.logo_code,
                  ]
                    .filter(Boolean)
                    .join(" · ") || COMPANY_KIND_LABELS[c.kind]}
                </div>
              </div>
            </div>
            {c.segment && <Badge variant="secondary">{c.segment}</Badge>}
          </button>
        ))}
      </div>
    </div>
  );
}
