import { createAdminClient } from "@/lib/supabase/admin";
import { hasServiceKey } from "@/lib/supabase/env";
import { PHOTO_BUCKET, PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "@/lib/enums";

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
      const { data } = await admin.storage.getBucket(PHOTO_BUCKET);
      if (data) return true;
      const { error } = await admin.storage.createBucket(PHOTO_BUCKET, {
        public: false,
        fileSizeLimit: PHOTO_MAX_BYTES,
        allowedMimeTypes: [...PHOTO_MIME_TYPES],
      });
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
