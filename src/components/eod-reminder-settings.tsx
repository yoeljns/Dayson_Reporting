"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEodReminder } from "@/app/(admin)/admin/ayarlar/actions";

export function EodReminderSettings({
  initial,
}: {
  initial: { enabled: boolean; hour: number; minute: number };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [time, setTime] = useState(
    `${String(initial.hour).padStart(2, "0")}:${String(initial.minute).padStart(2, "0")}`
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const [h, m] = time.split(":").map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) {
      setError("Geçerli bir saat girin.");
      return;
    }
    startTransition(async () => {
      const res = await saveEodReminder({ enabled, hour: h, minute: m });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            setSaved(false);
          }}
          className="h-5 w-5 rounded border-input accent-[hsl(var(--primary))]"
        />
        <span className="text-sm font-medium">Hatırlatma açık</span>
      </label>

      <div className="space-y-1">
        <Label htmlFor="eodTime">Hatırlatma saati (cihaz saatine göre)</Label>
        <Input
          id="eodTime"
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            setSaved(false);
          }}
          disabled={!enabled}
          className="w-40"
        />
        <p className="text-xs text-muted-foreground">
          Bu saatten sonra tamamlanmamış raporu olan pazarlamacılara ana ekranda
          uyarı gösterilir.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-[hsl(var(--success))]">
            <Check className="h-4 w-4" /> Kaydedildi
          </span>
        )}
      </div>
    </div>
  );
}
