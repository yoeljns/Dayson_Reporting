"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { AliasKind } from "@/lib/voice/parse-tr";
import { forgetAlias, rememberAlias } from "@/app/(app)/sesli/actions";

export type AliasTarget = { kind: AliasKind; id: string; label: string; hint?: string };
export type AliasRow = { id: string; heard: string; kind: AliasKind; targetId: string; targetLabel: string; createdAt: string; by: string | null };

const KIND_LABELS: Record<AliasKind, string> = {
  brand: "Marka (raf bilgisi)",
  competitor: "Rakip",
  competitor_product: "Rakip ürünü",
  category: "Ürün kategorisi",
  sku: "Stok ürünü",
  option: "Soru seçeneği",
};

export function VoiceAliasManager({ rows, targets }: { rows: AliasRow[]; targets: AliasTarget[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [heard, setHeard] = useState("");
  const [kind, setKind] = useState<AliasKind>("competitor");
  const [targetId, setTargetId] = useState("");
  const options = useMemo(() => targets.filter((t) => t.kind === kind), [targets, kind]);

  function add() {
    const t = options.find((o) => o.id === targetId);
    if (!heard.trim() || !t) return toast("Söyleyiş ve hedef gerekli", "warn");
    startTransition(async () => {
      const res = await rememberAlias({ heard, kind, targetId: t.id, targetLabel: t.label });
      if (res.error) return toast(res.error, "warn");
      toast("Eklendi", "ok");
      setHeard("");
      router.refresh();
    });
  }
  function del(id: string) {
    startTransition(async () => {
      const res = await forgetAlias({ id });
      if (res.error) return toast(res.error, "warn");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="va-heard">Söyleyiş</Label>
          <Input id="va-heard" placeholder="örn. sista, day son" value={heard} onChange={(e) => setHeard(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="va-kind">Tür</Label>
          <Select
            id="va-kind"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as AliasKind);
              setTargetId("");
            }}
          >
            {(Object.keys(KIND_LABELS) as AliasKind[])
              .filter((k) => k !== "option")
              .map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="va-target">Hedef</Label>
          <Select id="va-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Seçin</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end">
          <Button disabled={pending} onClick={add}>
            <Plus className="mr-1 h-4 w-4" /> Ekle
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Henüz söyleyiş yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-2">Söyleyiş</th>
                <th className="py-1.5 pr-2">Tür</th>
                <th className="py-1.5 pr-2">Hedef</th>
                <th className="py-1.5 pr-2">Ekleyen</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-medium">&quot;{r.heard}&quot;</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{KIND_LABELS[r.kind]}</td>
                  <td className="py-1.5 pr-2">{r.targetLabel}</td>
                  <td className="py-1.5 pr-2 text-xs text-muted-foreground">{r.by ?? "—"}</td>
                  <td className="py-1.5 text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={pending} onClick={() => del(r.id)} title="Sil">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
