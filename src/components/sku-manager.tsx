"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/ui/toast";
import type { Sku } from "@/types/db";
import { upsertSku, patchSku, reorderSku, deleteSku } from "@/app/(admin)/admin/urunler/actions";

type Cat = { id: string; label_tr: string };

export function SkuManager({ skus, categories }: { skus: Sku[]; categories: Cat[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [catId, setCatId] = useState("");
  const [units, setUnits] = useState("");
  const [inCount, setInCount] = useState(true);

  const catName = new Map(categories.map((c) => [c.id, c.label_tr]));

  function run(fn: () => Promise<{ error?: string }>, okMsg?: string) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setErr(res.error);
        toast(res.error, "warn");
        return;
      }
      if (okMsg) toast(okMsg, "ok");
      router.refresh();
    });
  }
  function startNew() {
    setEditing("new");
    setCode("");
    setName("");
    setCatId("");
    setUnits("");
    setInCount(true);
  }
  function startEdit(s: Sku) {
    setEditing(s.id);
    setCode(s.code);
    setName(s.name_tr);
    setCatId(s.category_id ?? "");
    setUnits(s.units_per_box ? String(s.units_per_box) : "");
    setInCount(s.in_stock_count);
  }
  function save() {
    run(
      async () => {
        const res = await upsertSku({
          id: editing === "new" ? null : editing,
          code,
          nameTr: name,
          categoryId: catId || null,
          unitsPerBox: units ? Number(units) : null,
          inStockCount: inCount,
        });
        if (!res.error) setEditing(null);
        return res;
      },
      editing === "new" ? "Ürün eklendi" : "Ürün güncellendi"
    );
  }

  const editor = (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Ürün kodu</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="örn. TAS-25" />
        </div>
        <div className="space-y-1">
          <Label>Ürün adı</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Kategori</Label>
          <Select value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label_tr}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Koli içi adet (ops.)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={inCount}
          onChange={(e) => setInCount(e.target.checked)}
        />
        Stok sayımında görünsün
      </label>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
          Vazgeç
        </Button>
        <Button size="sm" disabled={pending || !code.trim() || !name.trim()} onClick={save}>
          Kaydet
        </Button>
      </div>
    </div>
  );

  const counted = skus.filter((s) => s.is_active && s.in_stock_count).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Ürünler{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {counted} ürün stok sayımında
            </span>
          </CardTitle>
          {editing !== "new" && (
            <Button size="sm" onClick={startNew} disabled={pending}>
              <Plus className="mr-1 h-4 w-4" /> Ürün ekle
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {editing === "new" && editor}
          {skus.length === 0 && editing !== "new" && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Henüz ürün yok. Stok sayımında sayılacak ürünleri buradan ekleyin.
            </p>
          )}
          {skus.map((s, idx) =>
            editing === s.id ? (
              <div key={s.id}>{editor}</div>
            ) : (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-2 rounded-md border p-2 ${
                  !s.is_active ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                    <span>{s.name_tr}</span>
                    {!s.is_active && <Badge variant="secondary">Pasif</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[
                      s.category_id ? catName.get(s.category_id) : null,
                      s.units_per_box ? `${s.units_per_box} adet/koli` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <label
                    className="flex items-center gap-1 text-xs"
                    title="Stok sayımında görünsün"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={s.in_stock_count}
                      disabled={pending || !s.is_active}
                      onChange={(e) =>
                        run(() => patchSku({ id: s.id, inStockCount: e.target.checked }))
                      }
                    />
                    Sayım
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || idx === 0}
                    onClick={() => run(() => reorderSku({ id: s.id, direction: "up" }))}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending || idx === skus.length - 1}
                    onClick={() => run(() => reorderSku({ id: s.id, direction: "down" }))}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={pending} onClick={() => startEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => patchSku({ id: s.id, isActive: !s.is_active }))}
                  >
                    {s.is_active ? "Pasif" : "Aktif"}
                  </Button>
                  <ConfirmButton
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    message={`"${s.name_tr}" silinsin mi? Sayımı yapılmış ürünler silinmez, pasifleşir.`}
                    confirmText="Sil"
                    onConfirm={() => run(() => deleteSku({ id: s.id }), "Ürün kaldırıldı")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
