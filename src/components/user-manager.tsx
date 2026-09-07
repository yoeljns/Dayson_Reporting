"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  inviteUser,
  updateUserName,
  updateUserRole,
  toggleUserActive,
  setUserPassword,
} from "@/app/(admin)/admin/kullanicilar/actions";
import { KeyRound } from "lucide-react";

export function UserManager({ users }: { users: Profile[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("salesperson");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState(false);

  function add() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = invite
        ? await inviteUser({ email, fullName, role })
        : await createUser({ email, fullName, role, password });
      if (res.error) return setErr(res.error);
      setMsg(
        invite
          ? "Davet e-postası gönderildi. Kullanıcı bağlantıya tıklayıp şifresini belirleyecek."
          : "Kullanıcı oluşturuldu."
      );
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
          {!invite && (
            <div className="space-y-1.5">
              <Label htmlFor="pw">Geçici şifre</Label>
              <Input
                id="pw"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={invite}
              onChange={(e) => setInvite(e.target.checked)}
              className="h-4 w-4"
            />
            E-posta ile davet gönder (şifreyi kullanıcı kendi belirlesin)
          </label>
          {invite && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Not: Davet e-postasının gönderilebilmesi için Supabase&apos;de SMTP
              ve yönlendirme (redirect) ayarları yapılmış olmalı (README&apos;e
              bakın). Yapılmadıysa geçici şifre yöntemini kullanın.
            </p>
          )}
          {err && <p className="text-sm text-destructive sm:col-span-2">{err}</p>}
          {msg && (
            <p className="text-sm text-emerald-600 sm:col-span-2">{msg}</p>
          )}
          <div className="sm:col-span-2">
            <Button onClick={add} disabled={pending}>
              {invite ? "Davet Gönder" : "Kullanıcı Oluştur"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            pending={pending}
            onChangeRole={changeRole}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}

function UserRow({
  user,
  pending,
  onChangeRole,
  onToggle,
}: {
  user: Profile;
  pending: boolean;
  onChangeRole: (userId: string, r: UserRole) => void;
  onToggle: (userId: string, isActive: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(user.full_name ?? "");
  const [saving, startSave] = useTransition();
  const [nameErr, setNameErr] = useState<string | null>(null);
  const dirty = name.trim() !== (user.full_name ?? "").trim();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  function savePassword() {
    setPwErr(null);
    setPwMsg(null);
    startSave(async () => {
      const res = await setUserPassword({ userId: user.id, password: pw });
      if (res.error) {
        setPwErr(res.error);
        return;
      }
      setPw("");
      setPwOpen(false);
      setPwMsg("Şifre güncellendi; kullanıcıya yeni şifreyi iletin.");
    });
  }

  function saveName() {
    setNameErr(null);
    if (!name.trim()) {
      setNameErr("Ad Soyad zorunludur.");
      return;
    }
    startSave(async () => {
      const res = await updateUserName({ userId: user.id, fullName: name });
      if (res.error) {
        setNameErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ad Soyad"
              className="h-9 max-w-[16rem]"
            />
            {dirty && (
              <Button size="sm" disabled={saving} onClick={saveName}>
                Kaydet
              </Button>
            )}
            {!user.is_active && <Badge variant="secondary">Pasif</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
          {user.role === "salesperson" && (
            <Link
              href={`/admin/pazarlamaci/${user.id}`}
              className="text-xs text-primary hover:underline"
            >
              Dosyasını aç →
            </Link>
          )}
          {nameErr && <p className="text-xs text-destructive">{nameErr}</p>}
          {pwOpen && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Input
                type="text"
                autoComplete="off"
                placeholder="Yeni şifre (en az 6 karakter)"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="h-9 max-w-[16rem]"
              />
              <Button size="sm" disabled={saving || pw.length < 6} onClick={savePassword}>
                Şifreyi kaydet
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPwOpen(false); setPw(""); }}>
                Vazgeç
              </Button>
            </div>
          )}
          {pwErr && <p className="text-xs text-destructive">{pwErr}</p>}
          {pwMsg && <p className="text-xs text-[hsl(var(--success))]">{pwMsg}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={user.role}
            onChange={(e) => onChangeRole(user.id, e.target.value as UserRole)}
            className="h-9 w-auto"
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {USER_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            title="Şifre belirle"
            disabled={pending}
            onClick={() => setPwOpen((v) => !v)}
          >
            <KeyRound className="mr-1 h-4 w-4" /> Şifre
          </Button>
          <Button
            variant={user.is_active ? "outline" : "default"}
            size="sm"
            disabled={pending}
            onClick={() => onToggle(user.id, !user.is_active)}
          >
            {user.is_active ? "Pasifleştir" : "Aktifleştir"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
