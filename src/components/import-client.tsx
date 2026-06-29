"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IMPORT_COLUMNS } from "@/lib/import";

type Result = {
  status: string;
  rowCount: number;
  inserted: number;
  updated: number;
  errorCount: number;
  errors: { row: number; logo_code?: string; message: string }[];
};

export function ImportClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      [...IMPORT_COLUMNS],
      ["1001", "Örnek Bayi A.Ş.", "A", "temiz", "İstanbul", "0212 000 00 00", "pazarlamaci@firma.com"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bayiler");
    XLSX.writeFile(wb, "dayson-bayi-sablonu.xlsx");
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Aktarım başarısız.");
      } else {
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
      <CardContent className="space-y-4 pt-4">
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Şablon indir (.xlsx)
        </Button>

        <div className="space-y-2">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
          />
          <Button disabled={!file || busy} onClick={upload}>
            <Upload className="mr-2 h-4 w-4" />
            {busy ? "Aktarılıyor…" : "Yükle ve Aktar"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-medium">
              {result.inserted} eklendi, {result.updated} güncellendi,{" "}
              {result.errorCount} hata ({result.rowCount} satır)
            </p>
            {result.errors.length > 0 && (
              <div className="max-h-60 space-y-1 overflow-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-destructive">
                    Satır {e.row}
                    {e.logo_code ? ` (${e.logo_code})` : ""}: {e.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
