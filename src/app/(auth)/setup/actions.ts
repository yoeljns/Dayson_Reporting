"use server";

import { ensureSchema } from "@/lib/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";

export type SetupState = "schema_missing" | "needs_admin" | "ready";

/**
 * Determine where the system is in first-run setup:
 *  - schema_missing: tables not installed yet (auto-install failed/unavailable)
 *  - needs_admin: schema present but no users → show the create-admin form
 *  - ready: at least one user exists → normal login
 */
export async function getSetupState(): Promise<{
  state: SetupState;
  error?: string;
}> {
  let bootstrapError: string | undefined;
  try {
    await ensureSchema();
  } catch (e) {
    bootstrapError = e instanceof Error ? e.message : String(e);
  }

  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) {
    // Most likely the table doesn't exist yet (schema not installed).
    return { state: "schema_missing", error: bootstrapError ?? error.message };
  }
  return { state: (count ?? 0) === 0 ? "needs_admin" : "ready" };
}

/** Back-compat helper for the login page. */
export async function setupNeeded(): Promise<boolean> {
  const { state } = await getSetupState();
  return state !== "ready";
}

/** Create the first admin account. Guarded so it can't run after setup. */
export async function createFirstAdmin(input: {
  email: string;
  fullName: string;
  password: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await ensureSchema();
  const admin = createAdminClient();

  const { count, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (countErr) {
    return {
      error:
        "Veritabanı şeması bulunamadı. Lütfen önce kurulum SQL'ini çalıştırın.",
    };
  }
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
