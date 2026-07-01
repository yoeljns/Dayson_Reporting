"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import {
  addProductCategory,
  toggleProductCategory,
  renameProductCategory,
  moveProductCategory,
  setBrandActive,
  addBrandLink,
  removeBrandLink,
  toggleBrandOwn,
} from "@/app/(admin)/admin/urun-rekabeti/actions";

type Link = { id: string; brandId: string; name: string; isOwn: boolean };
type Category = {
  id: string;
  code: string;
  label_tr: string;
  is_active: boolean;
  links: Link[];
};

export function ProductMatrixManager({
  categories,
  inactiveBrands = [],
}: {
  categories: Category[];
  inactiveBrands?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [brandName, setBrandName] = useState<Record<string, string>>({});
  const [brandOwn, setBrandOwn] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Add category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yeni kategori</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="ncode">Kod</Label>
            <Input
              id="ncode"
              placeholder="ör. pu"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nlabel">Ad</Label>
            <Input
              id="nlabel"
              placeholder="ör. PU (Poliüretan Köpük)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-64"
            />
          </div>
          <Button
            disabled={pending || !newCode.trim() || !newLabel.trim()}
            onClick={() =>
              run(async () => {
                const res = await addProductCategory({
                  code: newCode,
                  labelTr: newLabel,
                });
                if (!res.error) {
                  setNewCode("");
                  setNewLabel("");
                }
                return res;
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Ekle
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {categories.map((c, idx) => (
        <Card key={c.id} className={c.is_active ? undefined : "opacity-60"}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            {renamingId === c.id ? (
              <div className="flex flex-1 items-center gap-2 pr-2">
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="h-8"
                  autoFocus
                />
                <Button
                  size="sm"
                  disabled={pending || !renameValue.trim()}
                  onClick={() =>
                    run(async () => {
                      const res = await renameProductCategory({
                        categoryId: c.id,
                        labelTr: renameValue,
                      });
                      if (!res.error) setRenamingId(null);
                      return res;
                    })
                  }
                >
                  Kaydet
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRenamingId(null)}
                >
                  Vazgeç
                </Button>
              </div>
            ) : (
              <CardTitle className="flex items-center gap-1 text-base">
                {c.label_tr}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({c.code})
                </span>
                <button
                  type="button"
                  title="Adı düzenle"
                  className="ml-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameValue(c.label_tr);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </CardTitle>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Yukarı taşı"
                disabled={pending || idx === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() =>
                  run(() =>
                    moveProductCategory({ categoryId: c.id, direction: "up" })
                  )
                }
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Aşağı taşı"
                disabled={pending || idx === categories.length - 1}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={() =>
                  run(() =>
                    moveProductCategory({ categoryId: c.id, direction: "down" })
                  )
                }
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.is_active}
                  disabled={pending}
                  onChange={(e) =>
                    run(() =>
                      toggleProductCategory({
                        categoryId: c.id,
                        isActive: e.target.checked,
                      })
                    )
                  }
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                Aktif
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {c.links.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  Marka yok.
                </span>
              )}
              {c.links.map((l) => (
                <span
                  key={l.id}
                  className="flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm"
                >
                  {l.name}
                  <button
                    type="button"
                    title="Biz / rakip"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        toggleBrandOwn({ linkId: l.id, isOwn: !l.isOwn })
                      )
                    }
                  >
                    <Badge variant={l.isOwn ? "success" : "secondary"}>
                      {l.isOwn ? "Biz" : "Rakip"}
                    </Badge>
                  </button>
                  <ConfirmButton
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    title="Kaldır"
                    message={`"${l.name}" bu kategoriden kaldırılsın mı?`}
                    confirmText="Kaldır"
                    onConfirm={() =>
                      run(() => removeBrandLink({ linkId: l.id }))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ConfirmButton>
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Marka ekle…"
                value={brandName[c.id] ?? ""}
                onChange={(e) =>
                  setBrandName((p) => ({ ...p, [c.id]: e.target.value }))
                }
                className="h-9 w-48"
              />
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={brandOwn[c.id] ?? false}
                  onChange={(e) =>
                    setBrandOwn((p) => ({ ...p, [c.id]: e.target.checked }))
                  }
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                Biz
              </label>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending || !(brandName[c.id] ?? "").trim()}
                onClick={() =>
                  run(async () => {
                    const res = await addBrandLink({
                      categoryId: c.id,
                      name: brandName[c.id] ?? "",
                      isOwn: brandOwn[c.id] ?? false,
                    });
                    if (!res.error) {
                      setBrandName((p) => ({ ...p, [c.id]: "" }));
                      setBrandOwn((p) => ({ ...p, [c.id]: false }));
                    }
                    return res;
                  })
                }
              >
                Ekle
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {inactiveBrands.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pasif markalar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Bu markalar hiçbir kategoride görünmüyor. Aktifleştirince bağlı
              oldukları kategorilerde tekrar seçilebilir olurlar.
            </p>
            <div className="flex flex-wrap gap-2">
              {inactiveBrands.map((b) => (
                <span
                  key={b.id}
                  className="flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 text-sm text-muted-foreground"
                >
                  {b.name}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setBrandActive({ brandId: b.id, isActive: true })
                      )
                    }
                  >
                    Aktifleştir
                  </Button>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
