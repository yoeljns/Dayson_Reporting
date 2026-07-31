import { requireProfile } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { ModeToggle } from "@/components/mode-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canSwitchMode, isManagementMode } from "@/lib/ui-mode";
import { USER_ROLE_LABELS } from "@/lib/enums";

export default async function AccountPage() {
  const profile = await requireProfile();
  const managementMode = isManagementMode(profile);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-semibold">Hesabım</h1>

      <Card>
        <CardContent className="space-y-1 pt-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ad Soyad</span>
            <span className="font-medium">{profile.full_name || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">E-posta</span>
            <span className="font-medium">{profile.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rol</span>
            <span className="font-medium">
              {USER_ROLE_LABELS[profile.role]}
            </span>
          </div>
        </CardContent>
      </Card>

      {canSwitchMode(profile) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ekran Modu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {managementMode
                ? "Yönetim modundasınız: ekip takibi, planlar, şikayetler ve analiz görünür. Ziyaret/şikayet girme ekranları gizli."
                : "Raporlama modundasınız: pazarlamacı ekranları görünür, kendiniz ziyaret ve şikayet girebilirsiniz."}
            </p>
            <ModeToggle managementMode={managementMode} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Şifre Değiştir</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
