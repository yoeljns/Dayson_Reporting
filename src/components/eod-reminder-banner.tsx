"use client";

import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";

/**
 * End-of-day reminder. Shows a prominent banner once the *device's* local time
 * passes the admin-configured cutoff (default 18:00) while unfinished visit
 * drafts remain. Re-checks every minute so it appears at the cutoff without a
 * reload.
 */
export function EodReminderBanner({
  enabled,
  hour,
  minute,
  draftCount,
}: {
  enabled: boolean;
  hour: number;
  minute: number;
  draftCount: number;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date()); // device-local time; only after mount to avoid SSR/hydration mismatch
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!enabled || draftCount <= 0 || !now) return null;

  const pastCutoff =
    now.getHours() > hour ||
    (now.getHours() === hour && now.getMinutes() >= minute);
  if (!pastCutoff) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive"
    >
      <AlarmClock className="h-6 w-6 shrink-0" />
      <div className="text-sm font-medium leading-snug">
        Gün bitmeden tamamlanmamış raporlarını bitir.
        <span className="ml-1 font-semibold">
          ({draftCount} bekleyen taslak)
        </span>
      </div>
    </div>
  );
}
