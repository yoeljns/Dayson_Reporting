"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Save the end-of-day reminder config (admin only). */
export async function saveEodReminder(input: {
  enabled: boolean;
  hour: number;
  minute: number;
}): Promise<{ ok?: boolean; error?: string }> {
  const admin = await requireAdmin();

  const hour = Math.trunc(input.hour);
  const minute = Math.trunc(input.minute);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return { error: "Saat 0-23 arasında olmalı." };
  }
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
    return { error: "Dakika 0-59 arasında olmalı." };
  }

  const client = createAdminClient();
  const { error } = await client.from("app_settings").upsert(
    {
      key: "eod_reminder",
      value: { enabled: !!input.enabled, hour, minute },
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    },
    { onConflict: "key" }
  );
  if (error) return { error: error.message };

  revalidatePath("/admin/ayarlar");
  revalidatePath("/");
  return { ok: true };
}
