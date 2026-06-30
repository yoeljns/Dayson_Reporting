import { requireAdmin } from "@/lib/auth";
import { getEodReminder } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EodReminderSettings } from "@/components/eod-reminder-settings";

export default async function SettingsPage() {
  await requireAdmin();
  const eod = await getEodReminder();

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Ayarlar</h1>
        <p className="text-sm text-muted-foreground">
          Uygulama genelindeki yönetici ayarları.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gün sonu hatırlatması</CardTitle>
        </CardHeader>
        <CardContent>
          <EodReminderSettings initial={eod} />
        </CardContent>
      </Card>
    </div>
  );
}
