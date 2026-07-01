"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SEGMENTS,
  DEBT_STATUSES,
  type Segment,
  type DebtStatus,
} from "@/lib/enums";

/** Set (or clear) the salesperson assigned to a dealer. */
export async function assignDealer(input: {
  companyId: string;
  salespersonId: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
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
 * Create a new distributor/dealer by hand. Managers use this to add a single
 * dealer without the Excel importer. If a logo code is supplied and already
 * belongs to an archived dealer, that record is restored (matching the import
 * flow); an active duplicate is rejected.
 */
export async function createDealer(input: {
  name: string;
  logoCode?: string | null;
  segment?: string | null;
  debtStatus?: string | null;
  city?: string | null;
  phone?: string | null;
  notes?: string | null;
  salespersonId?: string | null;
}): Promise<{ id?: string; restored?: boolean; error?: string }> {
  const profile = await requireManager();
  const admin = createAdminClient();

  const name = input.name.trim();
  if (!name) return { error: "Bayi adı zorunludur." };

  const logoCode = input.logoCode?.trim() || null;
  const segment =
    input.segment && (SEGMENTS as readonly string[]).includes(input.segment)
      ? (input.segment as Segment)
      : null;
  const debtStatus =
    input.debtStatus &&
    (DEBT_STATUSES as readonly string[]).includes(input.debtStatus)
      ? (input.debtStatus as DebtStatus)
      : null;
  const fields = {
    name,
    logo_code: logoCode,
    segment,
    debt_status: debtStatus,
    city: input.city?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  let companyId: string | null = null;
  let restored = false;

  // Reconcile by logo code (its unique index ignores deleted rows too).
  if (logoCode) {
    const { data: existing } = await admin
      .from("companies")
      .select("id, deleted_at")
      .eq("logo_code", logoCode)
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (!existing.deleted_at) {
        return { error: "Bu logo kodu zaten kullanımda." };
      }
      // Archived dealer with this code → restore + update.
      const { error } = await admin
        .from("companies")
        .update({ ...fields, kind: "distributor", deleted_at: null })
        .eq("id", existing.id);
      if (error) return { error: error.message };
      companyId = existing.id;
      restored = true;
    }
  }

  if (!companyId) {
    const { data, error } = await admin
      .from("companies")
      .insert({ ...fields, kind: "distributor", created_by: profile.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    companyId = data.id;
  }

  // Optional initial assignment (replace any existing, mirroring assignDealer).
  if (input.salespersonId) {
    await admin.from("assignments").delete().eq("company_id", companyId);
    const { error } = await admin.from("assignments").insert({
      company_id: companyId,
      salesperson_id: input.salespersonId,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/bayiler");
  return { id: companyId ?? undefined, restored };
}

/**
 * Delete a company. Hard-deletes when it has no linked records; otherwise
 * archives it (soft delete) so existing visits/complaints stay intact.
 */
export async function deleteCompany(input: {
  companyId: string;
}): Promise<{ ok?: boolean; archived?: boolean; error?: string }> {
  await requireManager();
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
