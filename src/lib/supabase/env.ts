/**
 * Resolve Supabase config from whichever env var names are present.
 *
 * The Vercel–Supabase integration injects `SUPABASE_URL` / `SUPABASE_ANON_KEY`,
 * while local dev / manual setups use the `NEXT_PUBLIC_` prefixed names. We
 * accept both so the app "just works" either way.
 *
 * NOTE: on the browser only `NEXT_PUBLIC_`-prefixed vars are inlined; the
 * non-prefixed ones resolve to undefined there. The browser client therefore
 * gets its config injected at runtime (see lib/supabase/public-config.ts).
 */
export function supabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  );
}

export function supabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  );
}

export function supabaseServiceKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  );
}

export function hasSupabaseConfig(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function hasServiceKey(): boolean {
  return Boolean(supabaseUrl() && supabaseServiceKey());
}
