import { requireAdmin } from "@/lib/auth";
import {
  getEodReminder,
  getPlanDeadline,
  getStaleDays,
  getPaceThresholds,
} from "@/lib/settings";
import { StaleDaysSettings, PaceSettings } from "@/components/portal-settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EodReminderSettings } from "@/components/eod-reminder-settings";
import { PlanDeadlineSettings } from "@/components/plan-deadline-settings";

export default async function SettingsPage() {
  await requireAdmin();
  const [eod, planDeadline, staleDays, pace] = await Promise.all([
    getEodReminder(),
    getPlanDeadline(),
    getStaleDays(),
    getPaceThresholds(),
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ziyaretsiz bayi eşiği</CardTitle>
        </CardHeader>
        <CardContent>
          <StaleDaysSettings initial={staleDays} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hedef tempo eşikleri</CardTitle>
        </CardHeader>
        <CardContent>
          <PaceSettings initial={pace} />
        </CardContent>
      </Card>
    </div>
  );
}
