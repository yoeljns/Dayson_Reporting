"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/ui/toast";
import {
  upsertCompetitorProduct,
  deleteCompetitorProduct,
} from "@/app/(admin)/admin/rakip-urunleri/actions";

type Product = { id: string; name: string; category_id: string | null; is_active: boolean; uses: number };
type Competitor = { id: string; name: string; products: Product[] };
type Cat = { id: string; label_tr: string };

export function CompetitorCatalogManager({
  competitors,
  categories,
}: {
  competitors: Competitor[];
  categories: Cat[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // product id or "new:<competitorId>"
  const [name, setName] = useState("");
  const [catId, setCatId] = useState("");
  const catName = new Map(categories.map((c) => [c.id, c.label_tr]));

  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) return toast(r.error, "warn");
      toast(ok, "ok");
      setEditing(null);
      router.refresh();
    });
  }

  const editor = (competitorId: string, productId: string | null) => (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
      <Input
        className="h-9 w-48"
        placeholder="Ürün adı"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <Select className="h-9 w-auto" value={catId} onChange={(e) => setCatId(e.target.value)}>
        <option value="">Kategori —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label_tr}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        disabled={pending || !name.trim()}
        onClick={() =>
          run(
            () =>
              upsertCompetitorProduct({
                id: productId,
                competitorId,
                name,
                categoryId: catId || null,
              }),
            productId ? "Ürün güncellendi" : "Ürün eklendi"
          )
        }
      >
        Kaydet
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
        Vazgeç
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {competitors.map((c) => (
        <Card key={c.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {c.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                · {c.products.length} ürün
              </span>
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setEditing(`new:${c.id}`);
                setName("");
                setCatId("");
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Ürün
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {editing === `new:${c.id}` && editor(c.id, null)}
            {c.products.length === 0 && editing !== `new:${c.id}` && (
              <p className="text-sm text-muted-foreground">Katalog boş.</p>
            )}
            {c.products.map((p) =>
              editing === p.id ? (
                <div key={p.id}>{editor(c.id, p.id)}</div>
              ) : (
                <div
                  key={p.id}
                  className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${
                    !p.is_active ? "opacity-60" : ""
                  }`}
                >
                  <div>
                    <span className="font-medium">{p.name}</span>
                    {p.category_id && (
                      <span className="text-muted-foreground"> · {catName.get(p.category_id)}</span>
                    )}
                    <span className="text-muted-foreground"> · {p.uses} kayıt</span>
                    {!p.is_active && <Badge variant="secondary" className="ml-1">Pasif</Badge>}
                  </div>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      onClick={() => {
                        setEditing(p.id);
                        setName(p.name);
                        setCatId(p.category_id ?? "");
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            upsertCompetitorProduct({
                              id: p.id,
                              competitorId: c.id,
                              name: p.name,
                              categoryId: p.category_id,
                              isActive: !p.is_active,
                            }),
                          p.is_active ? "Pasifleştirildi" : "Aktifleştirildi"
                        )
                      }
                    >
                      {p.is_active ? "Pasif" : "Aktif"}
                    </Button>
                    <ConfirmButton
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      message={`"${p.name}" silinsin mi? Kullanılan ürün pasifleşir.`}
                      confirmText="Sil"
                      onConfirm={() => run(() => deleteCompetitorProduct({ id: p.id }), "Ürün kaldırıldı")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                </div>
              )
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
