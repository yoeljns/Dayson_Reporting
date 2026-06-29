"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from "@/lib/enums";
import type { Profile } from "@/types/db";
import {
  createUser,
  updateUserRole,
  toggleUserActive,
} from "@/app/(admin)/admin/kullanicilar/actions";

export function UserManager({ users }: { users: Profile[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("salesperson");
  const [password, setPassword] = useState("");

  function add() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await createUser({ email, fullName, role, password });
      if (res.error) return setErr(res.error);
      setMsg("Kullanıcı oluşturuldu.");
      setEmail("");
      setFullName("");
      setPassword("");
      router.refresh();
    });
  }

  function changeRole(userId: string, r: UserRole) {
    startTransition(async () => {
      await updateUserRole({ userId, role: r });
      router.refresh();
    });
  }

  function toggle(userId: string, isActive: boolean) {
    startTransition(async () => {
      await toggleUserActive({ userId, isActive });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yeni Kullanıcı</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fn">Ad Soyad</Label>
            <Input
              id="fn"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em">E-posta</Label>
            <Input
              id="em"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Rol</Label>
            <Select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Geçici şifre</Label>
            <Input
              id="pw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && <p className="text-sm text-destructive sm:col-span-2">{err}</p>}
          {msg && (
            <p className="text-sm text-emerald-600 sm:col-span-2">{msg}</p>
          )}
          <div className="sm:col-span-2">
            <Button onClick={add} disabled={pending}>
              Kullanıcı Oluştur
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <div className="font-medium">
                  {u.full_name || "(isimsiz)"}{" "}
                  {!u.is_active && <Badge variant="secondary">Pasif</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={u.role}
                  onChange={(e) =>
                    changeRole(u.id, e.target.value as UserRole)
                  }
                  className="h-9 w-auto"
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {USER_ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <Button
                  variant={u.is_active ? "outline" : "default"}
                  size="sm"
                  disabled={pending}
                  onClick={() => toggle(u.id, !u.is_active)}
                >
                  {u.is_active ? "Pasifleştir" : "Aktifleştir"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
