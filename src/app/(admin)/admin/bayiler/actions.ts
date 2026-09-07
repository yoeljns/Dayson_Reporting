"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SEGMENTS,
  DEBT_STATUSES,
  COMPANY_KINDS,
  type Segment,
  type DebtStatus,
  type AssignmentRole,
  type CompanyKind,
} from "@/lib/enums";

function revalidateCompany(companyId: string) {
  revalidatePath("/admin/bayiler");
  revalidatePath("/admin/firmalar");
  revalidatePath(`/admin/bayi/${companyId}`);
  revalidatePath("/admin/son-ziyaretler");
  revalidatePath("/admin");
}

/**
 * Add a salesperson to a company (or change their role). A company has at
 * most one owner (Sorumlu) and any number of backups (Yedek); promoting a new
 * owner demotes the previous one instead of failing on the unique index.
 */
export async function upsertAssignment(input: {
  companyId: string;
  salespersonId: string;
  role: AssignmentRole;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const admin = createAdminClient();
  if (input.role === "owner") {
    const { error: demoteErr } = await admin
      .from("assignments")
      .update({ role: "backup" })
      .eq("company_id", input.companyId)
      .eq("role", "owner")
      .neq("salesperson_id", input.salespersonId);
    if (demoteErr) return { error: demoteErr.message };
  }
  const { error } = await admin.from("assignments").upsert(
    {
      company_id: input.companyId,
      salesperson_id: input.salespersonId,
      role: input.role,
    },
    { onConflict: "company_id,salesperson_id" }
  );
  if (error) return { error: error.message };
  revalidateCompany(input.companyId);
  return { ok: true };
}

/** Remove one salesperson from a company. */
export async function removeAssignment(input: {
  companyId: string;
  salespersonId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const admin = createAdminClient();
  const { error } = await admin
    .from("assignments")
    .delete()
    .eq("company_id", input.companyId)
    .eq("salesperson_id", input.salespersonId);
  if (error) return { error: error.message };
  revalidateCompany(input.companyId);
  return { ok: true };
}

/** Legacy single-select path: make this rep the owner (or clear everyone). */
export async function assignDealer(input: {
  companyId: string;
  salespersonId: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  if (!input.salespersonId) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("assignments")
      .delete()
      .eq("company_id", input.companyId);
    if (error) return { error: error.message };
    revalidateCompany(input.companyId);
    return { ok: true };
  }
  return upsertAssignment({
    companyId: input.companyId,
    salespersonId: input.salespersonId,
    role: "owner",
  });
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
  const city = input.city?.trim() || null;
  const phone = input.phone?.trim() || null;
  const notes = input.notes?.trim() || null;
  const fields = {
    name,
    logo_code: logoCode,
    segment,
    debt_status: debtStatus,
    city,
    phone,
    notes,
  };

  let companyId: string | null = null;
  let restored = false;

  // Reconcile by logo code (its unique index covers archived rows too, so the
  // code is still occupied while a dealer is only soft-deleted).
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
      // Archived dealer with this code → restore. Only overwrite fields the
      // manager actually filled in; keep the dealer's stored values otherwise.
      const restorePatch: Record<string, unknown> = {
        name,
        kind: "distributor",
        deleted_at: null,
      };
      if (segment !== null) restorePatch.segment = segment;
      if (debtStatus !== null) restorePatch.debt_status = debtStatus;
      if (city !== null) restorePatch.city = city;
      if (phone !== null) restorePatch.phone = phone;
      if (notes !== null) restorePatch.notes = notes;
      const { error } = await admin
        .from("companies")
        .update(restorePatch)
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

  // Optional initial owner.
  if (input.salespersonId && companyId) {
    const res = await upsertAssignment({
      companyId,
      salespersonId: input.salespersonId,
      role: "owner",
    });
    if (res.error) return { error: res.error };
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

/** Edit a company's identity fields from the portal (any kind). */
export async function updateCompanyMeta(input: {
  companyId: string;
  name?: string;
  kind?: CompanyKind;
  city?: string | null;
  plateCode?: string | null;
  phone?: string | null;
  buysFromCompanyId?: string | null;
  notes?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (!n) return { error: "Firma adı boş olamaz." };
    patch.name = n;
  }
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("companies")
    .select("kind")
    .eq("id", input.companyId)
    .maybeSingle();
  if (!current) return { error: "Firma bulunamadı." };
  if (input.kind !== undefined && input.kind !== current.kind) {
    if (!(COMPANY_KINDS as readonly string[]).includes(input.kind))
      return { error: "Geçersiz firma türü." };
    if (input.kind === "distributor")
      return { error: "Bayiye dönüştürmek için \"Bayiye dönüştür\" düğmesini kullanın." };
    patch.kind = input.kind;
    if (current.kind === "distributor") {
      // Leaving the dealer role: dealer-only identity fields are cleared.
      patch.logo_code = null;
      patch.segment = null;
      patch.debt_status = null;
    }
  }
  if (input.city !== undefined) patch.city = input.city?.trim() || null;
  if (input.plateCode !== undefined) {
    const p = (input.plateCode ?? "").trim();
    if (p && !/^[0-9]{2}$/.test(p)) return { error: "Plaka kodu 2 haneli olmalı." };
    patch.plate_code = p || null;
  }
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.buysFromCompanyId !== undefined) {
    if (input.buysFromCompanyId === input.companyId)
      return { error: "Firma kendi üzerinden alamaz." };
    if (input.buysFromCompanyId) {
      const { data: dealer } = await admin
        .from("companies")
        .select("id")
        .eq("id", input.buysFromCompanyId)
        .eq("kind", "distributor")
        .is("deleted_at", null)
        .maybeSingle();
      if (!dealer) return { error: "Hizmet veren bayi bulunamadı." };
    }
    patch.buys_from_company_id = input.buysFromCompanyId || null;
  }
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (Object.keys(patch).length === 0) return { ok: true };
  const { error } = await admin.from("companies").update(patch).eq("id", input.companyId);
  if (error) return { error: error.message };
  revalidateCompany(input.companyId);
  revalidatePath(`/firma/${input.companyId}`);
  return { ok: true };
}

/** Potansiyel bayi → Bayi: keeps history, gets a logo code / segment. */
export async function convertToDealer(input: {
  companyId: string;
  logoCode?: string | null;
  segment?: string | null;
  debtStatus?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const admin = createAdminClient();
  const logoCode = input.logoCode?.trim() || null;
  if (logoCode) {
    const { data: dup } = await admin
      .from("companies")
      .select("id")
      .eq("logo_code", logoCode)
      .neq("id", input.companyId)
      .limit(1)
      .maybeSingle();
    if (dup) return { error: "Bu logo kodu başka bir bayide kullanılıyor." };
  }
  const segment =
    input.segment && (SEGMENTS as readonly string[]).includes(input.segment)
      ? (input.segment as Segment)
      : null;
  const debtStatus =
    input.debtStatus && (DEBT_STATUSES as readonly string[]).includes(input.debtStatus)
      ? (input.debtStatus as DebtStatus)
      : null;
  const { error } = await admin
    .from("companies")
    .update({
      kind: "distributor",
      logo_code: logoCode,
      segment,
      debt_status: debtStatus,
      buys_from_company_id: null,
    })
    .eq("id", input.companyId);
  if (error) return { error: error.message };
  revalidateCompany(input.companyId);
  revalidatePath(`/firma/${input.companyId}`);
  return { ok: true };
}
