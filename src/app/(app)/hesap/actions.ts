"use server";

import { createClient } from "@/lib/supabase/server";

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
