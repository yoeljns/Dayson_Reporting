"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { weekStartOf, deadlineFor, WEEKDAY_NAMES_TR } from "@/lib/week";

/**
 * Weekly plan reminder. Nudges a salesperson whose CURRENT week's plan is not
 * yet submitted, relative to the admin-configured deadline (default Monday
 * 09:00). Uses the *device's* local time/week so it matches the rep's day.
 * Before the deadline: a soft (gold) reminder. After it: an urgent (red) one.
 */
export function PlanDeadlineBanner({
  enabled,
  weekday,
  hour,
  minute,
  plans,
}: {
  enabled: boolean;
  weekday: number;
  hour: number;
  minute: number;
  plans: { week_start: string; status: string }[];
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date()); // only after mount → no SSR/hydration mismatch
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!enabled || !now) return null;

  const thisWeek = weekStartOf(now);
  const plan = plans.find((p) => p.week_start === thisWeek);
  if (plan?.status === "gonderildi") return null; // already submitted → done

  const deadline = deadlineFor(thisWeek, weekday, hour, minute);
  const overdue = now.getTime() >= deadline.getTime();

  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const dayName = WEEKDAY_NAMES_TR[weekday] ?? "";

  return (
    <Link href="/plan" className="block">
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border p-3",
          overdue
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold))]"
        )}
      >
        <CalendarClock className="h-6 w-6 shrink-0" />
        <div className="text-sm font-medium leading-snug">
          {overdue
            ? "Bu haftanın ziyaret planını henüz göndermedin — lütfen tamamla."
            : `Bu haftanın ziyaret planını ${dayName} ${timeStr}'a kadar gönder.`}
        </div>
      </div>
    </Link>
  );
}
