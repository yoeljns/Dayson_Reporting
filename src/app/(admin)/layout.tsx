import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { OfflineSync } from "@/components/offline-sync";
import { ensureSchema } from "@/lib/bootstrap";
import { isManagementMode } from "@/lib/ui-mode";

// Two groups: day-to-day manager tools, then admin-only configuration.
const adminLinks = [
  { href: "/admin", label: "Özet", adminOnly: false, group: "ops" },
  { href: "/admin/ziyaretler", label: "Ziyaret Geçmişi", adminOnly: false, group: "ops" },
  { href: "/admin/planlar", label: "Haftalık Planlar", adminOnly: false, group: "ops" },
  { href: "/admin/son-ziyaretler", label: "Son Ziyaretler", adminOnly: false, group: "ops" },
  { href: "/admin/analiz", label: "Analiz", adminOnly: false, group: "ops" },
  { href: "/admin/raporlar", label: "Raporlar", adminOnly: false, group: "ops" },
  { href: "/admin/sikayetler", label: "Şikayet Kuyruğu", adminOnly: false, group: "ops" },
  { href: "/admin/rakip-haritasi", label: "Rakip Haritası", adminOnly: false, group: "ops" },
  { href: "/admin/bayiler", label: "Bayiler", adminOnly: false, group: "ops" },
  { href: "/admin/silinen-ziyaretler", label: "Silinenler", adminOnly: false, group: "ops" },
  { href: "/admin/import", label: "Excel İçe Aktar", adminOnly: true, group: "cfg" },
  { href: "/admin/kullanicilar", label: "Kullanıcılar", adminOnly: true, group: "cfg" },
  { href: "/admin/sorular", label: "Soru Kataloğu", adminOnly: true, group: "cfg" },
  { href: "/admin/urun-rekabeti", label: "Ürün Rekabeti", adminOnly: true, group: "cfg" },
  { href: "/admin/ayarlar", label: "Ayarlar", adminOnly: true, group: "cfg" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireManager();
  // Apply any pending idempotent schema patches (cheap; memoized per process).
  await ensureSchema().catch(() => {});
  const isAdmin = profile.role === "admin";
  const links = adminLinks.filter((l) => !l.adminOnly || isAdmin);
  const opsLinks = links.filter((l) => l.group === "ops");
  const cfgLinks = links.filter((l) => l.group === "cfg");

  return (
    <div className="min-h-screen pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-0">
      <AppNav
        role={profile.role}
        fullName={profile.full_name || profile.email}
        managementMode={isManagementMode(profile)}
      />
      {/* Managers land here in management mode — keep flushing any queued
          offline drafts they made while reporting. */}
      <OfflineSync />
      <div className="container py-4">
        <div className="mb-4 flex flex-wrap items-center gap-2 overflow-x-auto border-b pb-2">
          {opsLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              {l.label}
            </Link>
          ))}
          {cfgLinks.length > 0 && (
            <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
          )}
          {cfgLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <main>{children}</main>
      </div>
    </div>
  );
}
