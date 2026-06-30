"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/app/(app)/hesap/actions";

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit() {
    setError(null);
    setDone(false);
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }
    if (password !== confirm) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    startTransition(async () => {
      const res = await changePassword({ password });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      setPassword("");
      setConfirm("");
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="np">Yeni şifre</Label>
        <Input
          id="np"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp">Yeni şifre (tekrar)</Label>
        <Input
          id="cp"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && (
        <p className="text-sm text-emerald-600">Şifreniz güncellendi.</p>
      )}
      <Button onClick={submit} disabled={pending}>
        {pending ? "Kaydediliyor…" : "Şifreyi Güncelle"}
      </Button>
    </div>
  );
}
