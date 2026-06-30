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
