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

export async function saveComplaint(input: {
  id?: string | null;
  companyId?: string | null;
  complainantName?: string | null;
  complainantPhone?: string | null;
  visitId?: string | null;
  type: ComplaintType;
  productCategoryId?: string | null;
  description: string;
  priority: number;
  dueDate?: string | null;
  isDraft: boolean;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const description = input.description.trim();
  const complainantName = input.complainantName?.trim() || null;

  if (input.isDraft) {
    // A draft only needs something worth resuming.
    if (
      !description &&
      !input.companyId &&
      !complainantName &&
      !input.productCategoryId
    ) {
      return { error: "Taslak kaydetmek için en az bir alan doldurun." };
    }
  } else {
    if (!description) return { error: "Açıklama zorunludur." };
    // Need at least one way to identify who/what the complaint is about.
    if (!input.companyId && !complainantName) {
      return { error: "Distribütör seçin ya da şikayet eden kişiyi yazın." };
    }
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

  const row = {
    company_id: input.companyId || null,
    complainant_name: complainantName,
    complainant_phone: input.complainantPhone?.trim() || null,
    visit_id: input.visitId || null,
    type: input.type,
    product_category_id: input.productCategoryId || null,
    owner_dept: DEPT_BY_TYPE[input.type] ?? "satis",
    title,
    description,
    priority: input.priority,
    due_date: input.dueDate || null,
    is_draft: input.isDraft,
  };

  let id = input.id || null;
  if (id) {
    const { error } = await supabase
      .from("complaints")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("complaints")
      .insert({ ...row, reported_by: user.id })
      .select("id")
      .single();
    if (error) return { error: error.message };
    id = data.id;
  }

  // Opening event for the timeline — only once the complaint is finalized.
  if (!input.isDraft) {
    const { data: ev } = await supabase
      .from("complaint_events")
      .select("id")
      .eq("complaint_id", id)
      .limit(1)
      .maybeSingle();
    if (!ev) {
      await supabase.from("complaint_events").insert({
        complaint_id: id,
        actor_id: user.id,
        from_status: null,
        to_status: "acik",
        note: "Şikayet oluşturuldu.",
      });
    }
  }

  revalidatePath("/sikayetler");
  return { id: id ?? undefined };
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
