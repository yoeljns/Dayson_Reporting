"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, Plus, X, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCompetitor } from "@/app/(app)/rakip/actions";

export type PickedCompetitor = { id: string; name: string };

/**
 * Searchable competitor field with add-on-the-fly. Type a name: pick an existing
 * one from the list, or add a new one if it isn't there yet.
 */
export function CompetitorPicker({
  value,
  onChange,
}: {
  value: PickedCompetitor | null;
  onChange: (c: PickedCompetitor | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PickedCompetitor[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value) return;
    const supabase = createClient();
    let cancelled = false;
    const t = setTimeout(async () => {
      let query = supabase
        .from("competitors")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
        .limit(10);
      if (term.trim()) query = query.ilike("name", `%${term.trim()}%`);
      const { data } = await query;
      if (!cancelled) setResults((data as PickedCompetitor[]) ?? []);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border p-3">
        <span className="flex items-center gap-2 font-medium">
          <Swords className="h-4 w-4 text-muted-foreground" />
          {value.name}
        </span>
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

  const exact = results.some(
    (r) => r.name.toLowerCase() === term.trim().toLowerCase()
  );

  function addNew() {
    setError(null);
    startTransition(async () => {
      const res = await createCompetitor(term);
      if (res.error || !res.id) {
        setError(res.error ?? "Rakip eklenemedi.");
        return;
      }
      onChange({ id: res.id, name: res.name ?? term.trim() });
      setTerm("");
    });
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rakip ara veya yeni ekle…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {results.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c)}
          className="flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm hover:bg-accent"
        >
          <Swords className="h-4 w-4 text-muted-foreground" />
          {c.name}
        </button>
      ))}

      {term.trim() && !exact && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={pending}
          onClick={addNew}
        >
          <Plus className="mr-2 h-4 w-4" />
          &quot;{term.trim()}&quot; ekle
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
