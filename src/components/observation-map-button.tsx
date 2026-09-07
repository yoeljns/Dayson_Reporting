"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { mapObservationProduct } from "@/app/(admin)/admin/rakip-urunleri/actions";

/** "Kataloğa eşle" for a free-text competitor observation. */
export function ObservationMapButton({
  observationId,
  productName,
  products,
}: {
  observationId: string;
  productName: string;
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState(productName);
  const [pending, startTransition] = useTransition();

  if (!open)
    return (
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <Link2 className="mr-1 h-3 w-3" /> Kataloğa eşle
      </Button>
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select className="h-8 w-auto text-xs" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">Yeni ürün olarak ekle…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      {!pick && (
        <Input
          className="h-8 w-40 text-xs"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
      )}
      <Button
        size="sm"
        className="h-8"
        disabled={pending || (!pick && !newName.trim())}
        onClick={() =>
          startTransition(async () => {
            const r = await mapObservationProduct({
              observationId,
              competitorProductId: pick || null,
              newName: pick ? null : newName,
            });
            if (r.error) return toast(r.error, "warn");
            toast("Kataloğa eşlendi", "ok");
            setOpen(false);
            router.refresh();
          })
        }
      >
        Eşle
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>
        Vazgeç
      </Button>
    </div>
  );
}
