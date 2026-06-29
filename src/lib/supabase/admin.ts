import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseServiceKey } from "@/lib/supabase/env";

/**
 * Service-role client. BYPASSES RLS — server-only, never import in client code.
 * Callers MUST verify the requester is an admin before using this.
 */
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
