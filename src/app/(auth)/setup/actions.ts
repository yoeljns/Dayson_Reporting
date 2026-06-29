"use server";

import { ensureSchema } from "@/lib/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";

/** True when the system has no users yet (first-run). */
export async function setupNeeded(): Promise<boolean> {
  try {
    await ensureSchema();
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (error) return false;
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}

/** Create the first admin account. Guarded so it can't run after setup. */
export async function createFirstAdmin(input: {
  email: string;
  fullName: string;
  password: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await ensureSchema();
  const admin = createAdminClient();

  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return { error: "Kurulum zaten tamamlanmış." };
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    return { error: "E-posta ve şifre zorunludur." };
  }
  if (input.password.length < 6) {
    return { error: "Şifre en az 6 karakter olmalı." };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), role: "admin" },
  });
  if (error) return { error: error.message };

  if (data.user) {
    await admin
      .from("profiles")
      .update({ full_name: input.fullName.trim(), role: "admin", email })
      .eq("id", data.user.id);
  }
  return { ok: true };
}
