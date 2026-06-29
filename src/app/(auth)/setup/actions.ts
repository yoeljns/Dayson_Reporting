"use server";

import { ensureSchema } from "@/lib/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceKey } from "@/lib/supabase/env";

export type SetupState = "schema_missing" | "needs_admin" | "ready";

/**
 * Determine where the system is in first-run setup:
 *  - schema_missing: tables not installed / config incomplete → show notice
 *  - needs_admin: schema present but no users → show the create-admin form
 *  - ready: at least one user exists → normal login
 *
 * Never throws — any failure resolves to schema_missing with a message so the
 * page can render guidance instead of a server-side exception.
 */
export async function getSetupState(): Promise<{
  state: SetupState;
  error?: string;
}> {
  try {
    if (!hasServiceKey()) {
      return {
        state: "schema_missing",
        error:
          "SUPABASE_SERVICE_ROLE_KEY ortam değişkeni tanımlı değil. Vercel'de Supabase entegrasyonunu tamamlayın ve yeniden deploy edin.",
      };
    }

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
      return {
        state: "schema_missing",
        error: bootstrapError ?? error.message,
      };
    }
    return { state: (count ?? 0) === 0 ? "needs_admin" : "ready" };
  } catch (e) {
    return {
      state: "schema_missing",
      error: e instanceof Error ? e.message : String(e),
    };
  }
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
  if (!hasServiceKey()) {
    return {
      error:
        "Sunucu yapılandırması eksik (service role key). Lütfen Vercel ortam değişkenlerini kontrol edin.",
    };
  }

  try {
    await ensureSchema();
  } catch {
    /* surfaced below if the table is missing */
  }
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
