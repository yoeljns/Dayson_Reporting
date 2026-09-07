import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { cookies } from "next/headers";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabase/env";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Dayson Raporlama",
  description: "Pazarlama saha raporlama sistemi",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Avrupa Ziyaret",
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
  const theme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  return (
    <html lang="tr" className={theme === "dark" ? "dark" : undefined}>
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
