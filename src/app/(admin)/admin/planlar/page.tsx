import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { weekRangeLabel } from "@/lib/week";
import {
  PLAN_STATUS_LABELS,
  PLAN_STATUSES,
  type PlanStatus,
} from "@/lib/enums";

type Row = {
  id: string;
  week_start: string;
  status: PlanStatus;
  submitted_at: string | null;
  salesperson: { full_name: string } | { full_name: string }[] | null;
  visit_plan_items: { count: number }[];
};

export default async function ManagerPlansPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireManager();
  const supabase = createClient();

  const statusFilter = PLAN_STATUSES.includes(searchParams.status as PlanStatus)
    ? (searchParams.status as PlanStatus)
    : "gonderildi";

  let query = supabase
    .from("visit_plans")
    .select(
      "id, week_start, status, submitted_at, salesperson:salesperson_id(full_name), visit_plan_items(count)"
    )
    .order("week_start", { ascending: false })
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(300);
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data } = await query;
  const rows = (data as Row[] | null) ?? [];

  const filters: Array<{ key: string; label: string }> = [
    { key: "gonderildi", label: "Gönderilen" },
    { key: "all", label: "Tümü" },
  ];
  const active = statusFilter || "all";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Haftalık Planlar</h1>
        <p className="text-sm text-muted-foreground">
          Ekibin gönderdiği haftalık ziyaret planları.
        </p>
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/planlar?status=all" : `/admin/planlar?status=${f.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              active === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Plan bulunamadı.
          </p>
        ) : (
          rows.map((r) => {
            const sp = Array.isArray(r.salesperson)
              ? r.salesperson[0]
              : r.salesperson;
            const count = r.visit_plan_items?.[0]?.count ?? 0;
            return (
              <Link key={r.id} href={`/admin/planlar/${r.id}`}>
                <Card className="hover:bg-accent">
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <div className="font-medium">{sp?.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {weekRangeLabel(r.week_start)} · {count} firma
                      </div>
                    </div>
                    <Badge
                      variant={r.status === "gonderildi" ? "success" : "warning"}
                    >
                      {PLAN_STATUS_LABELS[r.status]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
