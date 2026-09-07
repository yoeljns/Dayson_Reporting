import { createClient } from "@/lib/supabase/server";

/**
 * Admin-tunable app settings (stored in the `app_settings` table).
 * Reads tolerate a missing row / table and fall back to defaults, so the app
 * keeps working before the patch runs.
 */

export type EodReminder = {
  enabled: boolean;
  hour: number; // 0-23, device-local
  minute: number; // 0-59
};

export const DEFAULT_EOD_REMINDER: EodReminder = {
  enabled: true,
  hour: 18,
  minute: 0,
};

export type PlanDeadline = {
  enabled: boolean;
  weekday: number; // 0=Monday … 6=Sunday
  hour: number; // 0-23, device-local
  minute: number; // 0-59
};

export const DEFAULT_PLAN_DEADLINE: PlanDeadline = {
  enabled: true,
  weekday: 0, // Monday
  hour: 9,
  minute: 0,
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.trunc(n)));

/** Read the end-of-day reminder config, falling back to the default. */
export async function getEodReminder(): Promise<EodReminder> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "eod_reminder")
      .maybeSingle();

    const v = (data?.value ?? null) as Partial<EodReminder> | null;
    if (!v) return DEFAULT_EOD_REMINDER;
    return {
      enabled:
        typeof v.enabled === "boolean"
          ? v.enabled
          : DEFAULT_EOD_REMINDER.enabled,
      hour:
        typeof v.hour === "number" && Number.isFinite(v.hour)
          ? clamp(v.hour, 0, 23)
          : DEFAULT_EOD_REMINDER.hour,
      minute:
        typeof v.minute === "number" && Number.isFinite(v.minute)
          ? clamp(v.minute, 0, 59)
          : DEFAULT_EOD_REMINDER.minute,
    };
  } catch {
    return DEFAULT_EOD_REMINDER;
  }
}

/** Read the weekly plan-submission deadline, falling back to the default. */
export async function getPlanDeadline(): Promise<PlanDeadline> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "plan_deadline")
      .maybeSingle();

    const v = (data?.value ?? null) as Partial<PlanDeadline> | null;
    if (!v) return DEFAULT_PLAN_DEADLINE;
    return {
      enabled:
        typeof v.enabled === "boolean"
          ? v.enabled
          : DEFAULT_PLAN_DEADLINE.enabled,
      weekday:
        typeof v.weekday === "number" && Number.isFinite(v.weekday)
          ? clamp(v.weekday, 0, 6)
          : DEFAULT_PLAN_DEADLINE.weekday,
      hour:
        typeof v.hour === "number" && Number.isFinite(v.hour)
          ? clamp(v.hour, 0, 23)
          : DEFAULT_PLAN_DEADLINE.hour,
      minute:
        typeof v.minute === "number" && Number.isFinite(v.minute)
          ? clamp(v.minute, 0, 59)
          : DEFAULT_PLAN_DEADLINE.minute,
    };
  } catch {
    return DEFAULT_PLAN_DEADLINE;
  }
}

export type PaceThresholds = { ahead: number; onTrack: number };
export const DEFAULT_STALE_DAYS = 30;
export const DEFAULT_PACE_THRESHOLDS: PaceThresholds = { ahead: 1.05, onTrack: 0.9 };

/** Days without a visit/count after which a dealer is flagged. */
export async function getStaleDays(): Promise<number> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "stale_days")
      .maybeSingle();
    const v = (data?.value ?? null) as { days?: unknown } | null;
    const n = Number(v?.days);
    return Number.isFinite(n) && n >= 1 ? clamp(n, 1, 365) : DEFAULT_STALE_DAYS;
  } catch {
    return DEFAULT_STALE_DAYS;
  }
}

/** Target pace thresholds: ratio ≥ ahead → "Önde", ≥ onTrack → "Yolunda". */
export async function getPaceThresholds(): Promise<PaceThresholds> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "target_pace_thresholds")
      .maybeSingle();
    const v = (data?.value ?? null) as Partial<PaceThresholds> | null;
    const ahead = Number(v?.ahead);
    const onTrack = Number(v?.onTrack);
    if (
      Number.isFinite(ahead) &&
      Number.isFinite(onTrack) &&
      ahead > onTrack &&
      onTrack > 0 &&
      ahead <= 3
    )
      return { ahead, onTrack };
    return DEFAULT_PACE_THRESHOLDS;
  } catch {
    return DEFAULT_PACE_THRESHOLDS;
  }
}
