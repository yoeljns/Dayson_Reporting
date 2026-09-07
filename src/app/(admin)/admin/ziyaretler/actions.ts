"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Archive (soft-delete) any visit — including completed ones and other reps' —
 * from the office history page. RLS only lets a rep delete their own visits, so
 * this uses the service-role client behind a requireManager() gate.
 */
export async function adminDeleteVisit(
  visitId: string
): Promise<{ ok?: boolean; error?: string }> {
  const admin = await requireManager();
  const client = createAdminClient();
  const { error } = await client
    .from("visits")
    .update({ deleted_at: new Date().toISOString(), deleted_by: admin.id })
    .eq("id", visitId);
  if (error) return { error: error.message };
  revalidatePath("/admin/ziyaretler");
  revalidatePath("/admin/silinen-ziyaretler");
  return { ok: true };
}

/** Restore a previously archived visit (managers and admins). */
export async function restoreVisit(
  visitId: string
): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const client = createAdminClient();
  const { error } = await client
    .from("visits")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", visitId);
  if (error) return { error: error.message };
  revalidatePath("/admin/ziyaretler");
  revalidatePath("/admin/silinen-ziyaretler");
  return { ok: true };
}
