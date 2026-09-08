import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceKey } from "@/lib/supabase/env";
import { DOCUMENT_MIME_TYPES, PDF_MAX_BYTES, PHOTO_BUCKET } from "@/lib/enums";

let ensured: Promise<boolean> | null = null;

/**
 * Make sure the private photo bucket exists. Created through the Storage API
 * with the service role (SQL cannot touch storage.objects with the migration
 * role). Memoised per process; a failure is retried on the next call.
 */
export function ensureStorage(): Promise<boolean> {
  if (!hasServiceKey()) return Promise.resolve(false);
  if (!ensured) {
    ensured = (async () => {
      const admin = createAdminClient();
      const opts = {
        public: false,
        fileSizeLimit: PDF_MAX_BYTES,
        allowedMimeTypes: [...DOCUMENT_MIME_TYPES],
      };
      const { data } = await admin.storage.getBucket(PHOTO_BUCKET);
      if (data) {
        // Existing buckets were created photo-only; widen once per process.
        const want = new Set<string>(opts.allowedMimeTypes);
        const have = new Set<string>(data.allowed_mime_types ?? []);
        const same =
          data.allowed_mime_types &&
          want.size === have.size &&
          [...want].every((m) => have.has(m)) &&
          data.file_size_limit === opts.fileSizeLimit;
        if (!same) {
          const { error } = await admin.storage.updateBucket(PHOTO_BUCKET, opts);
          if (error) console.error("[storage] bucket güncellenemedi:", error.message);
        }
        return true;
      }
      const { error } = await admin.storage.createBucket(PHOTO_BUCKET, opts);
      if (error && !/already exists/i.test(error.message)) {
        throw error;
      }
      return true;
    })().catch((e) => {
      console.error("[storage] bucket hazırlanamadı:", e);
      ensured = null;
      return false;
    });
  }
  return ensured;
}

export const PHOTO_SERVICE_MISSING =
  "Fotoğraf servisi yapılandırılmamış (SUPABASE_SERVICE_ROLE_KEY eksik).";
