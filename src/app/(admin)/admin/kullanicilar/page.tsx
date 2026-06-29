import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserManager } from "@/components/user-manager";
import type { Profile } from "@/types/db";

export default async function UsersPage() {
  await requireAdmin();
  // Use the admin client so the full roster is visible regardless of RLS.
  const admin = createAdminClient();
  const { data: users } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Kullanıcılar</h1>
      <UserManager users={(users as Profile[]) ?? []} />
    </div>
  );
}
