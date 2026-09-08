import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStorage } from "@/lib/storage";
import { PHOTO_BUCKET } from "@/lib/enums";

/**
 * Remove every document row + storage object of one record. The caller has
 * already verified it may delete the record; RLS still scopes the row delete.
 */
export async function deleteDocumentsFor(refTable: string, refId: string): Promise<void> {
  const supabase = createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("ref_table", refTable)
    .eq("ref_id", refId);
  const list = (docs ?? []) as { id: string; storage_path: string }[];
  if (list.length === 0) return;
  await supabase.from("documents").delete().in("id", list.map((d) => d.id));
  if (await ensureStorage()) {
    await createAdminClient().storage.from(PHOTO_BUCKET).remove(list.map((d) => d.storage_path));
  }
}
