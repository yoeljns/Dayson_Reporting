import { requireProfile } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { OfflineSync } from "@/components/offline-sync";
import { ensureSchema } from "@/lib/bootstrap";
import { isManagementMode } from "@/lib/ui-mode";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  // Apply any pending idempotent schema patches (memoized per process) so new
  // tables (e.g. visit plans) exist even for salespeople who never hit /admin.
  await ensureSchema().catch(() => {});

  return (
    <div className="min-h-screen pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-0">
      <AppNav
        role={profile.role}
        fullName={profile.full_name || profile.email}
        managementMode={isManagementMode(profile)}
      />
      <OfflineSync userId={profile.id} />
      <main className="container py-4">{children}</main>
    </div>
  );
}
