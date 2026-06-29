import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ImportClient } from "@/components/import-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IMPORT_STATUS_LABELS, type ImportStatus } from "@/lib/enums";
import type { ImportBatch } from "@/types/db";

const variant: Record<ImportStatus, "success" | "warning" | "destructive"> = {
  basarili: "success",
  kismi: "warning",
  hata: "destructive",
};

export default async function ImportPage() {
  await requireAdmin();
  const supabase = createClient();
  const { data: batches } = await supabase
    .from("import_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Excel / CSV İçe Aktar</h1>
        <p className="text-sm text-muted-foreground">
          Bayi listesini yükleyin. Kayıtlar <code>logo_kodu</code> ile eşleşir
          (varsa güncellenir, yoksa eklenir).
        </p>
      </div>

      <ImportClient />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Son Aktarımlar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!batches || batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz aktarım yok.</p>
          ) : (
            (batches as ImportBatch[]).map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div>
                  <div className="font-medium">{b.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleString("tr-TR")} ·{" "}
                    {b.inserted_count} eklendi · {b.updated_count} güncellendi ·{" "}
                    {b.error_count} hata
                  </div>
                </div>
                <Badge variant={variant[b.status]}>
                  {IMPORT_STATUS_LABELS[b.status]}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
