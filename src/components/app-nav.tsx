"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ClipboardList,
  CalendarDays,
  AlertTriangle,
  Swords,
  Shield,
  LogOut,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/(auth)/login/actions";
import { Logo } from "@/components/logo";
import type { UserRole } from "@/lib/enums";

const navItems = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/ziyaretler", label: "Ziyaretler", icon: ClipboardList },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/sikayetler", label: "Şikayetler", icon: AlertTriangle },
  { href: "/rakip/yeni", label: "Rakip", icon: Swords },
];

export function AppNav({
  role,
  fullName,
}: {
  role: UserRole;
  fullName: string;
}) {
  const pathname = usePathname();
  const isManager = role === "manager" || role === "admin";

  const items = [
    ...navItems,
    ...(isManager ? [{ href: "/admin", label: "Yönetim", icon: Shield }] : []),
  ];

  return (
    <>
      {/* Top bar (desktop + mobile header) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background px-4">
        <Link href="/" className="flex items-center">
          <Logo height={34} />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/hesap"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <UserCog className="h-4 w-4" />
            <span className="hidden sm:inline">{fullName}</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Çıkış</span>
            </button>
          </form>
        </div>
      </header>

      {/* Desktop side/top nav */}
      <nav className="hidden border-b bg-muted/30 sm:block">
        <div className="container flex gap-1 py-2">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile bottom nav — elevated & high-contrast for PWA (standalone) use */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t-2 border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-6px_rgba(40,30,20,0.28)] sm:hidden">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-foreground/60 hover:text-foreground"
              )}
            >
              {active && (
                <span className="absolute top-0 h-1 w-8 rounded-b-full bg-primary" />
              )}
              <item.icon className={cn("h-6 w-6", active && "stroke-[2.5]")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
