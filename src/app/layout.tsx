import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "Dayson Raporlama",
  description: "Pazarlama saha raporlama sistemi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Dayson Raporlama",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#EFE9E0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Required for env(safe-area-inset-*) to be non-zero on iOS, so the bottom
  // nav clears the home indicator in the installed (standalone) PWA.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>
        <Providers
          supabaseUrl={supabaseUrl()}
          supabaseAnonKey={supabaseAnonKey()}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
