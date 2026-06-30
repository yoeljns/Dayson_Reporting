import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { ensureSchema } from "@/lib/bootstrap";

const adminLinks = [
  { href: "/admin", label: "Özet", adminOnly: false },
  { href: "/admin/sikayetler", label: "Şikayet Kuyruğu", adminOnly: false },
  { href: "/admin/rakip-haritasi", label: "Rakip Haritası", adminOnly: false },
  { href: "/admin/silinen-ziyaretler", label: "Silinenler", adminOnly: false },
  { href: "/admin/import", label: "Excel İçe Aktar", adminOnly: true },
  { href: "/admin/bayiler", label: "Bayiler", adminOnly: true },
  { href: "/admin/kullanicilar", label: "Kullanıcılar", adminOnly: true },
  { href: "/admin/sorular", label: "Soru Kataloğu", adminOnly: true },
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
    <div className="min-h-screen pb-16 sm:pb-0">
      <AppNav role={profile.role} fullName={profile.full_name || profile.email} />
      <div className="container py-4">
        <div className="mb-4 flex flex-wrap gap-2 overflow-x-auto border-b pb-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent"
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
