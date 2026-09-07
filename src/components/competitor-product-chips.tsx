"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addCompetitorProduct } from "@/app/(app)/rakip/actions";

export type PickedProduct = { id: string; name: string };

/**
 * Catalog products of one competitor as chips. Picking one fills the product
 * name; "Serbest" lets the rep type an uncatalogued product instead (the
 * office can map it to the catalog later). New chips are created on the fly.
 */
export function CompetitorProductChips({
  competitorId,
  value,
  onChange,
}: {
  competitorId: string;
  value: PickedProduct | null;
  onChange: (p: PickedProduct | null) => void;
}) {
  const [products, setProducts] = useState<PickedProduct[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("competitor_products")
      .select("id, name")
      .eq("competitor_id", competitorId)
      .eq("is_active", true)
      .order("name")
      .limit(60)
      .then(({ data }) => {
        if (!cancelled) setProducts((data as PickedProduct[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [competitorId]);

  function add() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await addCompetitorProduct({ competitorId, name: newName });
        if (res.error || !res.id) {
          setError(res.error ?? "Ürün eklenemedi.");
          return;
        }
        const p = { id: res.id, name: res.name ?? newName.trim() };
        setProducts((prev) =>
          prev.some((x) => x.id === p.id)
            ? prev
            : [...prev, p].sort((a, b) => a.name.localeCompare(b.name, "tr"))
        );
        onChange(p);
        setNewName("");
        setAdding(false);
      } catch {
        setError("Eklenemedi — bağlantınızı kontrol edin.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium",
            value === null
              ? "border-primary bg-primary text-primary-foreground"
              : "hover:bg-accent"
          )}
        >
          Serbest
        </button>
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              value?.id === p.id
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {p.name}
          </button>
        ))}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Kataloğa ekle
          </button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2">
          <Input
            autoFocus
            placeholder="Ürün adı"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-9"
          />
          <Button
            type="button"
            size="sm"
            className="h-9"
            disabled={pending || !newName.trim()}
            onClick={add}
          >
            Ekle
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
          >
            Vazgeç
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
