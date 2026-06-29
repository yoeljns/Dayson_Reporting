"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { USER_ROLES, type UserRole } from "@/lib/enums";

export async function createUser(input: {
  email: string;
  fullName: string;
  role: UserRole;
  password: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    return { error: "E-posta ve geçici şifre zorunludur." };
  }
  if (input.password.length < 6) {
    return { error: "Şifre en az 6 karakter olmalı." };
  }
  if (!USER_ROLES.includes(input.role)) return { error: "Geçersiz rol." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), role: input.role },
  });
  if (error) return { error: error.message };

  // The trigger creates the profile; ensure name/role are set.
  if (data.user) {
    await admin
      .from("profiles")
      .update({ full_name: input.fullName.trim(), role: input.role, email })
      .eq("id", data.user.id);
  }
  revalidatePath("/admin/kullanicilar");
  return { ok: true };
}

export async function updateUserRole(input: {
  userId: string;
  role: UserRole;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  if (!USER_ROLES.includes(input.role)) return { error: "Geçersiz rol." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: input.role })
    .eq("id", input.userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/kullanicilar");
  return { ok: true };
}

export async function toggleUserActive(input: {
  userId: string;
  isActive: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_active: input.isActive })
    .eq("id", input.userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/kullanicilar");
  return { ok: true };
}
