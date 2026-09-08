import { requireManager } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { OfflineSync } from "@/components/offline-sync";
import { AdminSidebar, type AdminLink } from "@/components/admin-sidebar";
import { ensureSchema } from "@/lib/bootstrap";
import { isManagementMode } from "@/lib/ui-mode";

// Grouped portal menu. Managers see the operations groups; the configuration
// group is admin-only.
const adminLinks: AdminLink[] = [
  { href: "/admin", label: "Pano", group: "Genel", exact: true },
  { href: "/admin/analiz", label: "Analiz", group: "Genel" },
  { href: "/admin/raporlar", label: "Raporlar", group: "Genel" },
  { href: "/admin/firmalar", label: "Firmalar", group: "Saha" },
  { href: "/admin/bayiler", label: "Bayiler", group: "Saha" },
  { href: "/admin/ziyaretler", label: "Ziyaretler", group: "Saha" },
  { href: "/admin/son-ziyaretler", label: "Son Ziyaretler", group: "Saha" },
  { href: "/admin/silinen-ziyaretler", label: "Silinenler", group: "Saha" },
  { href: "/admin/haftalik", label: "Haftalık Özet", group: "Takip" },
  { href: "/admin/planlar", label: "Plan Onayı", group: "Takip" },
  { href: "/admin/sikayetler", label: "Şikayet Panosu", group: "Takip" },
  { href: "/admin/rakip-haritasi", label: "Rakip Bilgileri", group: "Takip" },
  { href: "/admin/stok", label: "Stok Durumu", group: "Takip" },
  { href: "/admin/anketler", label: "Özel Raporlar", group: "Takip" },
  { href: "/admin/hedefler", label: "Hedefler", group: "Takip" },
  { href: "/admin/kullanicilar", label: "Kullanıcılar", group: "Ayarlar", adminOnly: true },
  { href: "/admin/sorular", label: "Soru Kataloğu", group: "Ayarlar", adminOnly: true },
  { href: "/admin/formlar", label: "Form Alanları", group: "Ayarlar", adminOnly: true },
  { href: "/admin/urun-rekabeti", label: "Ürün Matrisi", group: "Ayarlar", adminOnly: true },
  { href: "/admin/urunler", label: "Ürünler", group: "Ayarlar", adminOnly: true },
  { href: "/admin/rakip-urunleri", label: "Rakip Ürünleri", group: "Ayarlar", adminOnly: true },
  { href: "/admin/import", label: "Excel İçe Aktar", group: "Ayarlar", adminOnly: true },
  { href: "/admin/ayarlar", label: "Ayarlar", group: "Ayarlar", adminOnly: true },
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

  return (
    <div className="min-h-screen pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-0">
      <AppNav
        role={profile.role}
        fullName={profile.full_name || profile.email}
        managementMode={isManagementMode(profile)}
      />
      {/* Managers land here in management mode — keep flushing any queued
          offline drafts they made while reporting. */}
      <OfflineSync userId={profile.id} />
      <div className="container py-4">
        <div className="flex gap-6">
          <AdminSidebar links={links} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
