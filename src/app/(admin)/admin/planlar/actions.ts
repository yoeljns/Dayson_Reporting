"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Approve or reject a submitted weekly plan. Goes through the
 * decide_visit_plan RPC (security definer) so the manager's own session is
 * enough — no service role needed; the RPC re-checks the role.
 */
export async function decidePlan(input: {
  planId: string;
  decision: "onaylandi" | "reddedildi";
  note?: string | null;
}): Promise<{ ok?: boolean; error?: string }> {
  await requireManager();
  const note = (input.note ?? "").trim();
  if (input.decision === "reddedildi" && !note)
    return { error: "Ret için açıklama zorunludur." };

  const supabase = createClient();
  const { error } = await supabase.rpc("decide_visit_plan", {
    p_plan_id: input.planId,
    p_decision: input.decision,
    p_note: note || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/planlar");
  revalidatePath(`/admin/planlar/${input.planId}`);
  revalidatePath("/plan");
  revalidatePath(`/plan/${input.planId}`);
  revalidatePath("/admin");
  return { ok: true };
}
