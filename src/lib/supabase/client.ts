import { createBrowserClient } from "@supabase/ssr";
import { getPublicConfig } from "@/lib/supabase/public-config";

/** Supabase client for Client Components (browser). */
export function createClient() {
  const { url, anonKey } = getPublicConfig();
  return createBrowserClient(url, anonKey);
}
