"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setPublicConfig } from "@/lib/supabase/public-config";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({
  children,
  supabaseUrl,
  supabaseAnonKey,
}: {
  children: React.ReactNode;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}) {
  // Make the server-resolved Supabase config available to the browser client
  // before any child renders / queries.
  if (supabaseUrl && supabaseAnonKey) {
    setPublicConfig({ url: supabaseUrl, anonKey: supabaseAnonKey });
  }

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      })
  );

  // Register the service worker for PWA / offline support.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal */
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
