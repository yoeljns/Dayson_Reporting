"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminLink = {
  href: string;
  label: string;
  group: string;
  adminOnly?: boolean;
  exact?: boolean;
};

/**
 * Portal navigation: a grouped left menu on desktop, a horizontal chip strip
 * on the phone. Hidden when printing.
 */
export function AdminSidebar({ links }: { links: AdminLink[] }) {
  const pathname = usePathname();
  const isActive = (l: AdminLink) =>
    l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(l.href + "/");
  // Firma 360 / salesperson file pages hang under their list entries.
  const activeHref =
    pathname.startsWith("/admin/bayi/")
      ? "/admin/firmalar"
      : pathname.startsWith("/admin/pazarlamaci/")
        ? "/admin/ziyaretler"
        : links.filter(isActive).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const groups = Array.from(new Set(links.map((l) => l.group)));

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-48 shrink-0 lg:block print:hidden">
        <nav className="sticky top-20 space-y-4">
          {groups.map((g) => (
            <div key={g}>
              <div className="section-label mb-1 px-2">{g}</div>
              <ul className="space-y-0.5">
                {links
                  .filter((l) => l.group === g)
                  .map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-sm",
                          l.href === activeHref
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                        )}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Phone / tablet */}
      <div className="fixed inset-x-0 top-14 z-10 border-b bg-background/95 backdrop-blur lg:hidden print:hidden">
        <div className="container flex gap-1 overflow-x-auto py-1.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
                l.href === activeHref
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="h-9 lg:hidden" aria-hidden />
    </>
  );
}
