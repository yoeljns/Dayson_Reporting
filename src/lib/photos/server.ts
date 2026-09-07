import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStorage } from "@/lib/storage";
import { PHOTO_BUCKET, type DocumentRefTable } from "@/lib/enums";

export type PhotoView = {
  id: string;
  url: string;
  mime: string;
  uploadedAt: string;
  uploadedBy: string;
  path: string;
};

const SIGNED_TTL = 60 * 60; // 1h — pages re-render well within that

/**
 * Photos of one record as signed URLs (RLS decides visibility; the service
 * role only signs). Returns [] when the photo service is not configured.
 */
export async function getPhotosFor(
  refTable: DocumentRefTable,
  refId: string
): Promise<PhotoView[]> {
  return getPhotosForMany(refTable, [refId]).then((m) => m[refId] ?? []);
}

/** Same as getPhotosFor for many records at once (lists, files). */
export async function getPhotosForMany(
  refTable: DocumentRefTable,
  refIds: string[]
): Promise<Record<string, PhotoView[]>> {
  const out: Record<string, PhotoView[]> = {};
  if (refIds.length === 0) return out;
  const supabase = createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, storage_path, mime, uploaded_at, uploaded_by, ref_id")
    .eq("ref_table", refTable)
    .in("ref_id", refIds)
    .order("uploaded_at", { ascending: true });
  const rows = (data ?? []) as {
    id: string;
    storage_path: string;
    mime: string;
    uploaded_at: string;
    uploaded_by: string;
    ref_id: string;
  }[];
  if (rows.length === 0) return out;
  if (!(await ensureStorage())) return out;
  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      SIGNED_TTL
    );
  const urlByPath = new Map(
    (signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])
  );
  for (const r of rows) {
    const url = urlByPath.get(r.storage_path);
    if (!url) continue;
    (out[r.ref_id] ??= []).push({
      id: r.id,
      url,
      mime: r.mime,
      uploadedAt: r.uploaded_at,
      uploadedBy: r.uploaded_by,
      path: r.storage_path,
    });
  }
  return out;
}
