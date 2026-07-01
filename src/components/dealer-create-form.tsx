"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SEGMENTS, DEBT_STATUSES, DEBT_STATUS_LABELS } from "@/lib/enums";
import { createDealer } from "@/app/(admin)/admin/bayiler/actions";

type SP = { id: string; full_name: string };

export function DealerCreateForm({ salespeople }: { salespeople: SP[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [logoCode, setLogoCode] = useState("");
  const [segment, setSegment] = useState("");
  const [debtStatus, setDebtStatus] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [salespersonId, setSalespersonId] = useState("");

  function reset() {
    setName("");
    setLogoCode("");
    setSegment("");
    setDebtStatus("");
    setCity("");
    setPhone("");
    setSalespersonId("");
  }

  function submit() {
    setErr(null);
    setMsg(null);
    if (!name.trim()) {
      setErr("Bayi adı zorunludur.");
      return;
    }
    startTransition(async () => {
      const res = await createDealer({
        name,
        logoCode: logoCode || null,
        segment: segment || null,
        debtStatus: debtStatus || null,
        city: city || null,
        phone: phone || null,
        salespersonId: salespersonId || null,
      });
      if (res.error || !res.id) {
        setErr(res.error ?? "Bayi eklenemedi.");
        return;
      }
      setMsg(res.restored ? "Arşivli bayi geri yüklendi." : "Bayi eklendi.");
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Yeni Bayi Ekle
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Yeni Bayi Ekle</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="d-name">Ad *</Label>
          <Input
            id="d-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-logo">Logo kodu</Label>
          <Input
            id="d-logo"
            value={logoCode}
            onChange={(e) => setLogoCode(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-city">Şehir</Label>
          <Input
            id="d-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-seg">Segment</Label>
          <Select
            id="d-seg"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            <option value="">— Seçiniz —</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-debt">Borç durumu</Label>
          <Select
            id="d-debt"
            value={debtStatus}
            onChange={(e) => setDebtStatus(e.target.value)}
          >
            <option value="">— Seçiniz —</option>
            {DEBT_STATUSES.map((d) => (
              <option key={d} value={d}>
                {DEBT_STATUS_LABELS[d]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-phone">Telefon</Label>
          <Input
            id="d-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-sp">Pazarlamacı (opsiyonel)</Label>
          <Select
            id="d-sp"
            value={salespersonId}
            onChange={(e) => setSalespersonId(e.target.value)}
          >
            <option value="">— Atanmamış —</option>
            {salespeople.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.full_name}
              </option>
            ))}
          </Select>
        </div>

        {err && <p className="text-sm text-destructive sm:col-span-2">{err}</p>}
        {msg && (
          <p className="text-sm text-emerald-600 sm:col-span-2">{msg}</p>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Button onClick={submit} disabled={pending}>
            Kaydet
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
              setErr(null);
              setMsg(null);
            }}
          >
            Kapat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
