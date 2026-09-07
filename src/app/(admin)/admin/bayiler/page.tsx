import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DealerManager } from "@/components/dealer-manager";
import { DealerCreateForm } from "@/components/dealer-create-form";
import { groupAssignments } from "@/lib/assignments";

export default async function DealersPage() {
  await requireManager();
  const admin = createAdminClient();

  const [{ data: companies }, { data: assignments }, { data: profiles }] =
    await Promise.all([
      admin
        .from("companies")
        .select("id, name, logo_code, segment, debt_status, city")
        .eq("kind", "distributor")
        .is("deleted_at", null)
        .order("name")
        .limit(2000),
      admin.from("assignments").select("company_id, salesperson_id, role"),
      admin
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .eq("role", "salesperson")
        .order("full_name"),
    ]);

  const assignMap = groupAssignments(assignments);

  const dealers = (companies ?? []).map((c) => ({
    ...c,
    owner: assignMap.get(c.id)?.owner ?? null,
    backups: assignMap.get(c.id)?.backups ?? [],
  }));

  const salespeople =
    (profiles as { id: string; full_name: string }[]) ?? [];

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Bayiler</h1>
      <p className="text-sm text-muted-foreground">
        Her bayinin bir sorumlu pazarlamacısı, istenirse yedek pazarlamacıları
        olur; hepsi bayiyi görür ve ziyaret girebilir.
      </p>
      <DealerCreateForm salespeople={salespeople} />
      <DealerManager dealers={dealers} salespeople={salespeople} />
    </div>
  );
}
