"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureStorage, PHOTO_SERVICE_MISSING } from "@/lib/storage";
import { photoPath } from "@/lib/photos/path";
import {
  DOCUMENT_MIME_TYPES,
  DOCUMENT_REF_TABLES,
  PHOTO_BUCKET,
  isPdfMime,
  maxBytesForMime,
  type DocumentRefTable,
} from "@/lib/enums";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REF_META: Record<
  DocumentRefTable,
  { table: string; ownerCol: string; companyCol: string | null }
> = {
  visit: { table: "visits", ownerCol: "salesperson_id", companyCol: "company_id" },
  complaint: { table: "complaints", ownerCol: "reported_by", companyCol: "company_id" },
  competitor_observation: {
    table: "competitor_observations",
    ownerCol: "salesperson_id",
    companyCol: "company_id",
  },
  stock_count: { table: "stock_counts", ownerCol: "salesperson_id", companyCol: "company_id" },
};

function validRef(refTable: string, refId: string): refTable is DocumentRefTable {
  return (
    (DOCUMENT_REF_TABLES as readonly string[]).includes(refTable) &&
    UUID_RE.test(refId)
  );
}

/**
 * Who may touch photos of a record: the record's owner, a manager, or — when
 * the record does not exist yet (form not saved) — any signed-in rep, since
 * the path is namespaced by the future record id and attach re-checks.
 */
async function canAccessRef(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  refTable: DocumentRefTable,
  refId: string,
  opts: { allowMissing: boolean }
): Promise<{ ok: boolean; companyId: string | null; error?: string }> {
  const meta = REF_META[refTable];
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const isManager = me?.role === "manager" || me?.role === "admin";
  const admin = createAdminClient();
  const cols = [meta.ownerCol, meta.companyCol].filter(Boolean).join(", ");
  const { data: row } = await admin
    .from(meta.table)
    .select(cols)
    .eq("id", refId)
    .maybeSingle();
  const r = row as Record<string, unknown> | null;
  if (!r) {
    if (opts.allowMissing) return { ok: true, companyId: null };
    return { ok: false, companyId: null, error: "Kayıt bulunamadı." };
  }
  const owner = r[meta.ownerCol] as string | null;
  const companyId = meta.companyCol ? ((r[meta.companyCol] as string | null) ?? null) : null;
  if (owner === userId || isManager) return { ok: true, companyId };
  return { ok: false, companyId, error: "Bu kayda fotoğraf ekleme yetkiniz yok." };
}

/** Signed upload URL for one photo. The browser PUTs straight to Storage. */
export async function createPhotoUploadTicket(input: {
  refTable: string;
  refId: string;
  documentId: string;
  mime: string;
  sizeBytes: number;
}): Promise<{ path?: string; token?: string; error?: string }> {
  if (!validRef(input.refTable, input.refId) || !UUID_RE.test(input.documentId))
    return { error: "Geçersiz kayıt." };
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(input.mime))
    return { error: "Yalnızca JPEG, PNG, WebP fotoğraf veya PDF yüklenebilir." };
  if (input.sizeBytes > maxBytesForMime(input.mime)) {
    const mb = Math.round(maxBytesForMime(input.mime) / 1024 / 1024);
    return { error: `${isPdfMime(input.mime) ? "PDF" : "Fotoğraf"} ${mb} MB sınırını aşıyor.` };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };

  if (!(await ensureStorage())) return { error: PHOTO_SERVICE_MISSING };

  const access = await canAccessRef(supabase, user.id, input.refTable, input.refId, {
    allowMissing: true,
  });
  if (!access.ok) return { error: access.error };

  const path = photoPath(input.refTable, input.refId, input.documentId, input.mime);
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(PHOTO_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { error: error?.message ?? "Yükleme bileti alınamadı." };
  return { path: data.path, token: data.token };
}

export type PhotoAttachInput = {
  documentId: string;
  path: string;
  mime: string;
  sizeBytes: number;
};

/** Register uploaded photos in `documents`. Idempotent (23505 → ok). */
export async function attachPhotos(input: {
  refTable: string;
  refId: string;
  photos: PhotoAttachInput[];
}): Promise<{ ok?: boolean; error?: string }> {
  if (!validRef(input.refTable, input.refId)) return { error: "Geçersiz kayıt." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  if (input.photos.length === 0) return { ok: true };

  const access = await canAccessRef(supabase, user.id, input.refTable, input.refId, {
    allowMissing: false,
  });
  if (!access.ok) return { error: access.error };

  const prefix = `${input.refTable}/${input.refId}/`;
  for (const p of input.photos) {
    if (!UUID_RE.test(p.documentId) || !p.path.startsWith(prefix))
      return { error: "Geçersiz fotoğraf yolu." };
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(p.mime))
      return { error: "Geçersiz dosya türü." };
    if (p.sizeBytes > maxBytesForMime(p.mime)) return { error: "Dosya boyut sınırını aşıyor." };
    const { error } = await supabase.from("documents").insert({
      id: p.documentId,
      kind: isPdfMime(p.mime) ? "file" : "photo",
      storage_path: p.path,
      mime: p.mime,
      size_bytes: p.sizeBytes,
      company_id: access.companyId,
      ref_table: input.refTable,
      ref_id: input.refId,
      uploaded_by: user.id,
    });
    if (error && error.code !== "23505") return { error: error.message };
  }
  revalidateRef(input.refTable, input.refId);
  return { ok: true };
}

/** Delete one photo (row + bytes). Owner of the photo or a manager. */
export async function removePhoto(input: {
  documentId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Oturum bulunamadı." };
  // RLS: the select only returns rows the caller may delete.
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, ref_table, ref_id")
    .eq("id", input.documentId)
    .maybeSingle();
  if (!doc) return { error: "Fotoğraf bulunamadı." };
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) return { error: error.message };
  if (await ensureStorage()) {
    await createAdminClient().storage.from(PHOTO_BUCKET).remove([doc.storage_path]);
  }
  revalidateRef(doc.ref_table as string, doc.ref_id as string);
  return { ok: true };
}

function revalidateRef(refTable: string, refId: string) {
  switch (refTable) {
    case "visit":
      revalidatePath(`/ziyaret/${refId}`);
      break;
    case "complaint":
      revalidatePath(`/sikayet/${refId}`);
      revalidatePath(`/admin/sikayetler/${refId}`);
      break;
    case "competitor_observation":
      revalidatePath(`/rakip/${refId}`);
      break;
    case "stock_count":
      revalidatePath(`/stok/${refId}`);
      break;
    default:
      break;
  }
}
