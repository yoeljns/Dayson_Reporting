"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Set (or clear) the salesperson assigned to a dealer. */
export async function assignDealer(input: {
  companyId: string;
  salespersonId: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  await admin.from("assignments").delete().eq("company_id", input.companyId);
  if (input.salespersonId) {
    const { error } = await admin.from("assignments").insert({
      company_id: input.companyId,
      salesperson_id: input.salespersonId,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/bayiler");
  return { ok: true };
}

/**
 * Delete a company. Hard-deletes when it has no linked records; otherwise
 * archives it (soft delete) so existing visits/complaints stay intact.
 */
export async function deleteCompany(input: {
  companyId: string;
}): Promise<{ ok?: boolean; archived?: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("companies")
    .delete()
    .eq("id", input.companyId);

  if (error) {
    // Has linked records (FK) → archive instead of failing.
    const { error: archiveErr } = await admin
      .from("companies")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", input.companyId);
    if (archiveErr) return { error: archiveErr.message };
    revalidatePath("/admin/bayiler");
    return { ok: true, archived: true };
  }

  revalidatePath("/admin/bayiler");
  return { ok: true };
}
