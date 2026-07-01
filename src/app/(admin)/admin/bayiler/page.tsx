import { requireManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DealerManager } from "@/components/dealer-manager";
import { DealerCreateForm } from "@/components/dealer-create-form";

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
      admin.from("assignments").select("company_id, salesperson_id"),
      admin
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .eq("role", "salesperson")
        .order("full_name"),
    ]);

  const assignMap = new Map(
    (assignments ?? []).map((a) => [a.company_id, a.salesperson_id])
  );

  const dealers = (companies ?? []).map((c) => ({
    ...c,
    assignedTo: assignMap.get(c.id) ?? null,
  }));

  const salespeople =
    (profiles as { id: string; full_name: string }[]) ?? [];

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Bayiler</h1>
      <DealerCreateForm salespeople={salespeople} />
      <DealerManager dealers={dealers} salespeople={salespeople} />
    </div>
  );
}
