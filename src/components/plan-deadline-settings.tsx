"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WEEKDAY_NAMES_TR } from "@/lib/week";
import { savePlanDeadline } from "@/app/(admin)/admin/ayarlar/actions";

export function PlanDeadlineSettings({
  initial,
}: {
  initial: { enabled: boolean; weekday: number; hour: number; minute: number };
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [weekday, setWeekday] = useState(initial.weekday);
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
      const res = await savePlanDeadline({
        enabled,
        weekday,
        hour: h,
        minute: m,
      });
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

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label htmlFor="planDay">Gün</Label>
          <Select
            id="planDay"
            value={weekday}
            onChange={(e) => {
              setWeekday(parseInt(e.target.value, 10));
              setSaved(false);
            }}
            disabled={!enabled}
            className="w-40"
          >
            {WEEKDAY_NAMES_TR.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="planTime">Saat (cihaz saatine göre)</Label>
          <Input
            id="planTime"
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setSaved(false);
            }}
            disabled={!enabled}
            className="w-40"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Bu güne/saate kadar haftalık planını göndermeyen pazarlamacılara ana
        ekranda hatırlatma gösterilir.
      </p>

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
