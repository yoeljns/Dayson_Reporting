"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { requireProfile } from "@/lib/auth";
import { canSwitchMode } from "@/lib/ui-mode";

/**
 * Switch the signed-in manager/admin between management (viewing) mode and
 * reporting mode. Stored on the profile so the choice follows them from phone
 * to web. RLS policy profiles_update_self allows this (role stays unchanged).
 */
export async function setManagementMode(
  on: boolean
): Promise<{ ok?: boolean; error?: string }> {
  const profile = await requireProfile();
  if (!canSwitchMode(profile)) return { error: "Bu ayar size açık değil." };

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ management_mode: on })
    .eq("id", profile.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Change the currently signed-in user's own password. */
export async function changePassword(input: {
  password: string;
}): Promise<{ ok?: boolean; error?: string }> {
  if (!input.password || input.password.length < 6) {
    return { error: "Şifre en az 6 karakter olmalı." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const { error } = await supabase.auth.updateUser({
    password: input.password,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Light / dark theme, stored in a cookie so it applies before hydration. */
export async function setTheme(
  theme: "light" | "dark"
): Promise<{ ok?: boolean; error?: string }> {
  cookies().set(THEME_COOKIE, parseTheme(theme), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
