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
