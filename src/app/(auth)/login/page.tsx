"use client";

import { Suspense, useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "./actions";
import { setupNeeded } from "@/app/(auth)/setup/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Giriş yapılıyor…" : "Giriş Yap"}
    </Button>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirectTo = params.get("redirect") ?? "/";
  const passiveError = params.get("error") === "pasif";
  const [state, formAction] = useFormState(login, undefined);

  // First run (no users yet): send to the setup screen.
  useEffect(() => {
    setupNeeded().then((needed) => {
      if (needed) router.replace("/setup");
    });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl">
            Dayson Raporlama
          </CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            Pazarlama saha raporlama sistemi
          </p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="redirect" value={redirectTo} />
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {passiveError && (
              <p className="text-sm text-destructive">
                Hesabınız pasif durumda. Yöneticinizle iletişime geçin.
              </p>
            )}
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <SubmitButton />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
