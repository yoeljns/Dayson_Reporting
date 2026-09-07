"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { saveStaleDays, savePaceThresholds } from "@/app/(admin)/admin/ayarlar/actions";

export function StaleDaysSettings({ initial }: { initial: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [days, setDays] = useState(String(initial));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="stale">Kaç gün ziyaret edilmeyen bayi &quot;ziyaretsiz&quot; sayılsın?</Label>
        <Input
          id="stale"
          type="number"
          inputMode="numeric"
          className="w-32"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button
        disabled={pending}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const r = await saveStaleDays({ days: Number(days) });
            if (r.error) return setErr(r.error);
            toast("Kaydedildi", "ok");
            router.refresh();
          });
        }}
      >
        Kaydet
      </Button>
    </div>
  );
}

export function PaceSettings({ initial }: { initial: { ahead: number; onTrack: number } }) {
  const router = useRouter();
  const { toast } = useToast();
  const [ahead, setAhead] = useState(String(initial.ahead));
  const [onTrack, setOnTrack] = useState(String(initial.onTrack));
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const num = (s: string) => Number(s.replace(",", "."));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Tempo = gerçekleşen ÷ (hedef × yılın geçen payı). Oran birinci eşiğin
        üstündeyse &quot;Önde&quot;, ikinci eşiğin üstündeyse &quot;Yolunda&quot;, altındaysa
        &quot;Geride&quot;.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="pace-ahead">Önde eşiği</Label>
          <Input
            id="pace-ahead"
            inputMode="decimal"
            value={ahead}
            onChange={(e) => setAhead(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pace-on">Yolunda eşiği</Label>
          <Input
            id="pace-on"
            inputMode="decimal"
            value={onTrack}
            onChange={(e) => setOnTrack(e.target.value)}
          />
        </div>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button
        disabled={pending}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const r = await savePaceThresholds({ ahead: num(ahead), onTrack: num(onTrack) });
            if (r.error) return setErr(r.error);
            toast("Kaydedildi", "ok");
            router.refresh();
          });
        }}
      >
        Kaydet
      </Button>
    </div>
  );
}
