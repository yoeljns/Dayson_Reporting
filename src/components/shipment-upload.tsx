"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatTRDate } from "@/lib/week";

type Result = {
  range: [string, string];
  rows: number;
  inserted: number;
  products: number;
  excluded: number;
  unmatchedCustomers: string[];
  unmappedProducts: { code: string; desc: string }[];
};

/** Weekly TOPLU.xlsx upload card (Logo "Malzeme Ekstresi"). */
export function ShipmentUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/sevkiyat", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Yükleme başarısız.");
      else {
        setResult(json as Result);
        router.refresh();
      }
    } catch {
      setError("Ağ hatası. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <p className="text-sm text-muted-foreground">
          Logo&apos;dan alınan <span className="font-medium text-foreground">Malzeme Ekstresi (TOPLU.xlsx)</span>{" "}
          dosyasını her hafta yükleyin. Dosyanın kapsadığı tarih aralığındaki sevkiyatlar yenisiyle değiştirilir;
          aynı dosyayı tekrar yüklemek çift sayım yapmaz.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
        />
        <Button disabled={!file || busy} onClick={upload}>
          <Upload className="mr-2 h-4 w-4" />
          {busy ? "Yükleniyor…" : "Yükle"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="space-y-1 rounded-md border p-3 text-sm">
            <p className="font-medium">
              {formatTRDate(result.range[0])} – {formatTRDate(result.range[1])}: {result.inserted} sevkiyat satırı,{" "}
              {result.products} ürün
              {result.excluded > 0 ? ` (${result.excluded} satır hedef dışı ürün: kalibre / pad / kızak)` : ""}
            </p>
            {result.unmatchedCustomers.length > 0 && (
              <p className="text-amber-700 dark:text-amber-400">
                {result.unmatchedCustomers.length} müşteri adı firmayla eşleşmedi — aşağıdan eşleyin.
              </p>
            )}
            {result.unmappedProducts.length > 0 && (
              <p className="text-amber-700 dark:text-amber-400">
                {result.unmappedProducts.length} ürün kodu kategoriye eşlenemedi:{" "}
                {result.unmappedProducts.map((p) => p.code).join(", ")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
