import { requireProfile } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { OfflineSync } from "@/components/offline-sync";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="min-h-screen pb-16 sm:pb-0">
      <AppNav role={profile.role} fullName={profile.full_name || profile.email} />
      <OfflineSync />
      <main className="container py-4">{children}</main>
    </div>
  );
}
