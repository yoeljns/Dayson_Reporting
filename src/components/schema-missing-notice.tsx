import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPO_RAW =
  "https://raw.githubusercontent.com/yoeljns/Dayson_Reporting/claude/marketing-reporting-system-npkkdi/supabase/migrations";

/**
 * Shown when the database schema hasn't been installed yet (auto-install could
 * not reach the database). Gives the exact one-time manual step instead of a
 * silent redirect loop.
 */
export function SchemaMissingNotice({ error }: { error?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">Veritabanı kurulumu gerekli</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tablolar henüz oluşturulmamış. Bir kerelik şu adımı yapın:
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Supabase paneli → sol menü <b>SQL Editor</b> → <b>New query</b>.
            </li>
            <li>
              Şu dosyanın tamamını kopyalayıp yapıştırın ve <b>Run</b>:
              <br />
              <a
                href={`${REPO_RAW}/0001_init.sql`}
                target="_blank"
                rel="noreferrer"
                className="break-all text-primary underline"
              >
                0001_init.sql
              </a>
            </li>
            <li>
              Yeni bir query açıp şunu yapıştırın ve <b>Run</b>:
              <br />
              <a
                href={`${REPO_RAW}/0002_seed.sql`}
                target="_blank"
                rel="noreferrer"
                className="break-all text-primary underline"
              >
                0002_seed.sql
              </a>
            </li>
            <li>
              Bu sayfayı <b>yenileyin</b> — yönetici hesabı oluşturma ekranı
              açılacak.
            </li>
          </ol>
          {error && (
            <p className="rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
              Teknik detay: {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
