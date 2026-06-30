import { requireAdmin } from "@/lib/auth";
import { getEodReminder, getPlanDeadline } from "@/lib/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EodReminderSettings } from "@/components/eod-reminder-settings";
import { PlanDeadlineSettings } from "@/components/plan-deadline-settings";

export default async function SettingsPage() {
  await requireAdmin();
  const [eod, planDeadline] = await Promise.all([
    getEodReminder(),
    getPlanDeadline(),
  ]);

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Haftalık plan son tarihi</CardTitle>
        </CardHeader>
        <CardContent>
          <PlanDeadlineSettings initial={planDeadline} />
        </CardContent>
      </Card>
    </div>
  );
}
