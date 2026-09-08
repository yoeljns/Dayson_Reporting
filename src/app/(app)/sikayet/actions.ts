"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteDocumentsFor } from "@/lib/documents/server";
import { todayIso } from "@/lib/week";
import {
  cleanExtras,
  loadFormFields,
  missingRequiredField,
  fieldOn,
  type Extras,
} from "@/lib/form-fields";
import type { ComplaintStatus } from "@/lib/enums";

/** Title shown in lists: first line of the description, trimmed. */
function complaintTitleFrom(description: string): string {
  const line = description.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line || "Şikayet";
}

export async function saveComplaint(input: {
  id?: string | null;
  /** Client-generated uuid for a NEW record (offline replay idempotency). */
  clientId?: string | null;
  companyId?: string | null;
  complainantName?: string | null;
  complainantPhone?: string | null;
  visitId?: string | null;
  productCategoryId?: string | null;
  description: string;
  /** YYYY-MM-DD "tespit tarihi"; defaults to today. */
  detectedAt?: string | null;
  extras?: Extras | null;
  isDraft: boolean;
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  const fields = await loadFormFields(supabase, "sikayet");
  const description = input.description.trim();
  const complainantName = input.complainantName?.trim() || null;
  const detectedAt =
    input.detectedAt && /^\d{4}-\d{2}-\d{2}$/.test(input.detectedAt) && input.detectedAt <= todayIso()
      ? input.detectedAt
      : todayIso();
  const extras = cleanExtras(fields, input.extras);

  if (input.isDraft) {
    // A draft only needs something worth resuming.
    if (!description && !input.companyId && !complainantName && !input.productCategoryId) {
      return { error: "Taslak kaydetmek için en az bir alan doldurun." };
    }
  } else {
    if (!description) return { error: "Açıklama zorunludur." };
    // Need at least one way to identify who/what the complaint is about.
    if (!input.companyId && !complainantName && fieldOn(fields, "company")) {
      return { error: "Distribütör seçin ya da şikayet eden kişiyi yazın." };
    }
    const missing = missingRequiredField(
      fields,
      {
        complainant_name: complainantName,
        complainant_phone: input.complainantPhone?.trim() || null,
        product_category_id: input.productCategoryId || null,
        description,
        detected_at: detectedAt,
        company: input.companyId || null,
      },
      extras
    );
    if (missing) return { error: `"${missing.label_tr}" alanı zorunludur.` };
  }

  const row = {
    company_id: input.companyId || null,
    complainant_name: complainantName,
    complainant_phone: input.complainantPhone?.trim() || null,
    visit_id: input.visitId || null,
    product_category_id: input.productCategoryId || null,
    title: complaintTitleFrom(description),
    description,
    detected_at: detectedAt,
    extras,
    is_draft: input.isDraft,
  };

  let id = input.id || null;
  if (id) {
    const { data: ex } = await supabase
      .from("complaints")
      .select("reported_by")
      .eq("id", id)
      .maybeSingle();
    if (!ex) return { error: "Şikayet bulunamadı." };
    if (ex.reported_by !== user.id)
      return { error: "Yalnızca kendi şikayetinizi düzenleyebilirsiniz." };
    const { error } = await supabase
      .from("complaints")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from("complaints")
      .insert({
        ...(input.clientId ? { id: input.clientId } : {}),
        ...row,
        reported_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      // Replay of an already-saved record → update it instead.
      if (error.code === "23505" && input.clientId) {
        id = input.clientId;
        const { error: updErr } = await supabase
          .from("complaints")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (updErr) return { error: updErr.message };
      } else {
        return { error: error.message };
      }
    } else {
      id = data.id;
    }
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
  revalidatePath(`/sikayet/${id}`);
  revalidatePath("/admin/sikayetler");
  return { id: id ?? undefined };
}

/** Delete a complaint (reporter or manager) together with its attachments. */
export async function deleteComplaint(input: {
  complaintId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  const { data: c } = await supabase
    .from("complaints")
    .select("id, reported_by, company_id")
    .eq("id", input.complaintId)
    .maybeSingle();
  if (!c) return { error: "Şikayet bulunamadı." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isManager = me?.role === "manager" || me?.role === "admin";
  if (c.reported_by !== user.id && !isManager)
    return { error: "Yalnızca kendi şikayetinizi silebilirsiniz." };

  await deleteDocumentsFor("complaint", c.id);
  const { error } = await supabase.from("complaints").delete().eq("id", c.id);
  if (error) return { error: error.message };
  revalidatePath("/sikayetler");
  revalidatePath("/admin/sikayetler");
  revalidatePath("/admin");
  if (c.company_id) {
    revalidatePath(`/firma/${c.company_id}`);
    revalidatePath(`/admin/bayi/${c.company_id}`);
  }
  return { ok: true };
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
