"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createFirstAdmin } from "@/app/(auth)/setup/actions";

export function SetupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createFirstAdmin({ email, fullName, password });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      setTimeout(() => router.replace("/login"), 1200);
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl">İlk Kurulum</CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            Yönetici (admin) hesabınızı oluşturun
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <p className="text-center text-sm text-emerald-600">
              Hesap oluşturuldu. Giriş ekranına yönlendiriliyorsunuz…
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName">Ad Soyad</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-posta</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Şifre (en az 6 karakter)</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                size="lg"
                className="w-full"
                disabled={pending || !email || password.length < 6}
                onClick={submit}
              >
                {pending ? "Oluşturuluyor…" : "Yönetici Hesabı Oluştur"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
