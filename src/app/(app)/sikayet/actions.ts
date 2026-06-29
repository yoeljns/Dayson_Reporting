"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type {
  ComplaintType,
  ComplaintOwnerDept,
  ComplaintStatus,
} from "@/lib/enums";

export async function createComplaint(input: {
  companyId?: string | null;
  complainantName?: string | null;
  complainantPhone?: string | null;
  visitId?: string | null;
  type: ComplaintType;
  ownerDept: ComplaintOwnerDept;
  title: string;
  description: string;
  priority: number;
  dueDate?: string | null;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  if (!input.title.trim() || !input.description.trim()) {
    return { error: "Başlık ve açıklama zorunludur." };
  }
  // Need at least one way to identify who/what the complaint is about.
  if (!input.companyId && !input.complainantName?.trim()) {
    return { error: "Distribütör seçin ya da şikayet eden kişiyi yazın." };
  }

  const { data, error } = await supabase
    .from("complaints")
    .insert({
      company_id: input.companyId || null,
      complainant_name: input.complainantName?.trim() || null,
      complainant_phone: input.complainantPhone?.trim() || null,
      reported_by: user.id,
      visit_id: input.visitId || null,
      type: input.type,
      owner_dept: input.ownerDept,
      title: input.title.trim(),
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
