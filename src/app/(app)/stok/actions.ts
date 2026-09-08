"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteDocumentsFor } from "@/lib/documents/server";
import { todayIso } from "@/lib/week";
import { cleanExtras, loadFormFields, missingRequiredField, type Extras } from "@/lib/form-fields";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Save a pallet count at a dealer. `id` is client-generated (offline replay);
 * an existing id is updated in place. Lines are replaced atomically.
 */
export async function saveStockCount(input: {
  id?: string | null;
  companyId: string;
  visitId?: string | null;
  countedAt?: string | null;
  note?: string | null;
  extras?: Extras | null;
  lines: { skuId: string; pallets: number }[];
}): Promise<{ id?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  const fields = await loadFormFields(supabase, "stok");
  const extras = cleanExtras(fields, input.extras);

  const lines = input.lines
    .filter((l) => UUID_RE.test(l.skuId) && Number.isFinite(l.pallets) && l.pallets >= 0)
    .map((l) => ({ sku_id: l.skuId, pallets: Math.round(l.pallets * 10) / 10 }));
  if (lines.length === 0 || lines.every((l) => l.pallets === 0))
    return { error: "En az bir ürün için palet sayısı girin." };

  const countedAt =
    input.countedAt && /^\d{4}-\d{2}-\d{2}$/.test(input.countedAt)
      ? input.countedAt
      : todayIso();
  const note = input.note?.trim() || null;
  const missing = missingRequiredField(
    fields,
    { company: input.companyId, lines: lines.length, note },
    extras
  );
  if (missing) return { error: `"${missing.label_tr}" alanı zorunludur.` };
  const head = {
    company_id: input.companyId,
    visit_id: input.visitId || null,
    counted_at: countedAt,
    note,
    extras,
  };

  let id = input.id && UUID_RE.test(input.id) ? input.id : null;
  let existed = false;
  if (id) {
    const { data: ex } = await supabase
      .from("stock_counts")
      .select("id, salesperson_id")
      .eq("id", id)
      .maybeSingle();
    existed = Boolean(ex);
    if (ex && ex.salesperson_id !== user.id) {
      const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (me?.role !== "manager" && me?.role !== "admin")
        return { error: "Yalnızca kendi sayımınızı düzenleyebilirsiniz." };
    }
  }
  if (id && existed) {
    const { error } = await supabase
      .from("stock_counts")
      .update({ ...head, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: friendly(error.message) };
  } else {
    const { data, error } = await supabase
      .from("stock_counts")
      .insert({ ...(id ? { id } : {}), ...head, salesperson_id: user.id })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505" && id) {
        // Replay: the head already exists → fall through to line replace.
      } else {
        return { error: friendly(error.message) };
      }
    } else {
      id = data.id;
    }
  }

  const { error: linesErr } = await supabase.rpc("replace_stock_count_lines", {
    p_stock_count_id: id,
    p_rows: lines,
  });
  if (linesErr) return { error: linesErr.message };

  revalidatePath("/admin/stok");
  revalidatePath(`/firma/${input.companyId}`);
  revalidatePath(`/admin/bayi/${input.companyId}`);
  if (id) revalidatePath(`/stok/${id}`);
  if (input.visitId) revalidatePath(`/ziyaret/${input.visitId}`);
  return { id: id ?? undefined };
}

function friendly(msg: string) {
  if (/yalnızca bayi/i.test(msg)) return "Stok sayımı yalnızca bayi için girilebilir.";
  if (/row-level security/i.test(msg))
    return "Bu bayi size atanmamış; stok sayımı giremezsiniz.";
  return msg;
}

/** Delete a stock count (owner or manager); lines cascade, files removed. */
export async function deleteStockCount(input: {
  stockCountId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  const { data: c } = await supabase
    .from("stock_counts")
    .select("id, salesperson_id, company_id, visit_id")
    .eq("id", input.stockCountId)
    .maybeSingle();
  if (!c) return { error: "Sayım bulunamadı." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isManager = me?.role === "manager" || me?.role === "admin";
  if (c.salesperson_id !== user.id && !isManager)
    return { error: "Yalnızca kendi sayımınızı silebilirsiniz." };
  await deleteDocumentsFor("stock_count", c.id);
  const { error } = await supabase.from("stock_counts").delete().eq("id", c.id);
  if (error) return { error: error.message };
  revalidatePath("/admin/stok");
  revalidatePath(`/firma/${c.company_id}`);
  revalidatePath(`/admin/bayi/${c.company_id}`);
  if (c.visit_id) revalidatePath(`/ziyaret/${c.visit_id}`);
  return { ok: true };
}
