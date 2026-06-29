"use client";

/**
 * Runtime config for the browser Supabase client. The server reads the env
 * (under either naming) and injects the public URL + anon key here via
 * <Providers>, so the browser client works even when the integration only set
 * the non-`NEXT_PUBLIC_` variable names (which the browser can't read directly).
 */
type PublicConfig = { url: string; anonKey: string };

let injected: PublicConfig | null = null;

export function setPublicConfig(cfg: PublicConfig) {
  if (cfg.url && cfg.anonKey) injected = cfg;
}

export function getPublicConfig(): PublicConfig {
  if (injected) return injected;
  // Fallback to build-time inlined NEXT_PUBLIC_ vars (local dev).
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}
