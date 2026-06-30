import { requireProfile } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { USER_ROLE_LABELS } from "@/lib/enums";

export default async function AccountPage() {
  const profile = await requireProfile();

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
