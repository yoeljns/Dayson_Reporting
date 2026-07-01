"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  COMPLAINT_TYPE_LABELS,
  type ComplaintType,
  type ComplaintOwnerDept,
  type ComplaintStatus,
} from "@/lib/enums";

// The department is auto-routed from the complaint type (the manual field was
// removed from the form).
const DEPT_BY_TYPE: Record<ComplaintType, ComplaintOwnerDept> = {
  urun_hatasi: "kalite_uretim",
  fiyat_fatura_hatasi: "muhasebe",
  servis_hatasi: "satis",
  teslimat: "lojistik",
  diger: "satis",
};

export async function createComplaint(input: {
  companyId?: string | null;
  complainantName?: string | null;
  complainantPhone?: string | null;
  visitId?: string | null;
  type: ComplaintType;
  productCategoryId?: string | null;
  description: string;
  priority: number;
  dueDate?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  if (!input.description.trim()) {
    return { error: "Açıklama zorunludur." };
  }
  // Need at least one way to identify who/what the complaint is about.
  if (!input.companyId && !input.complainantName?.trim()) {
    return { error: "Distribütör seçin ya da şikayet eden kişiyi yazın." };
  }

  // Auto-generate a title from the type (+ product) — the title field was removed.
  let productLabel: string | null = null;
  if (input.productCategoryId) {
    const { data: cat } = await supabase
      .from("product_categories")
      .select("label_tr")
      .eq("id", input.productCategoryId)
      .maybeSingle();
    productLabel = (cat as { label_tr: string } | null)?.label_tr ?? null;
  }
  const title =
    COMPLAINT_TYPE_LABELS[input.type] +
    (productLabel ? ` – ${productLabel}` : "");

  const { data, error } = await supabase
    .from("complaints")
    .insert({
      company_id: input.companyId || null,
      complainant_name: input.complainantName?.trim() || null,
      complainant_phone: input.complainantPhone?.trim() || null,
      reported_by: user.id,
      visit_id: input.visitId || null,
      type: input.type,
      product_category_id: input.productCategoryId || null,
      owner_dept: DEPT_BY_TYPE[input.type] ?? "satis",
      title,
      description: input.description.trim(),
      priority: input.priority,
      due_date: input.dueDate || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Opening event for the timeline.
  await supabase.from("complaint_events").insert({
    complaint_id: data.id,
    actor_id: user.id,
    from_status: null,
    to_status: "acik",
    note: "Şikayet oluşturuldu.",
  });

  revalidatePath("/sikayetler");
  return { id: data.id };
}

export async function changeComplaintStatus(input: {
  complaintId: string;
  toStatus: ComplaintStatus;
  note: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("update_complaint_status", {
    p_complaint_id: input.complaintId,
    p_to_status: input.toStatus,
    p_note: input.note,
  });
  if (error) return { error: error.message };
  revalidatePath(`/sikayet/${input.complaintId}`);
  revalidatePath("/sikayetler");
  revalidatePath("/admin/sikayetler");
  return { ok: true };
}
