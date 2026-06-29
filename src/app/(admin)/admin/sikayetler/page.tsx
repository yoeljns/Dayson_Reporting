import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  COMPLAINT_TYPE_LABELS,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_OWNER_DEPT_LABELS,
  COMPLAINT_PRIORITY_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_OWNER_DEPTS,
  type ComplaintStatus,
  type ComplaintOwnerDept,
} from "@/lib/enums";

const statusVariant: Record<
  ComplaintStatus,
  "warning" | "default" | "success" | "secondary"
> = {
  acik: "warning",
  islemde: "default",
  cozuldu: "success",
  iptal: "secondary",
};

export default async function ComplaintQueuePage({
  searchParams,
}: {
  searchParams: { status?: string; dept?: string };
}) {
  await requireManager();
  const supabase = createClient();

  const status = COMPLAINT_STATUSES.includes(
    searchParams.status as ComplaintStatus
  )
    ? (searchParams.status as ComplaintStatus)
    : undefined;
  const dept = COMPLAINT_OWNER_DEPTS.includes(
    searchParams.dept as ComplaintOwnerDept
  )
    ? (searchParams.dept as ComplaintOwnerDept)
    : undefined;

  let query = supabase
    .from("complaints")
    .select(
      "id, title, type, status, owner_dept, priority, due_date, created_at, complainant_name, companies(name), reporter:reported_by(full_name)"
    )
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  if (dept) query = query.eq("owner_dept", dept);

  const { data: complaints } = await query;

  function buildHref(next: { status?: string; dept?: string }) {
    const sp = new URLSearchParams();
    const s = next.status ?? status;
    const d = next.dept ?? dept;
    if (s) sp.set("status", s);
    if (d) sp.set("dept", d);
    const qs = sp.toString();
    return qs ? `/admin/sikayetler?${qs}` : "/admin/sikayetler";
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Şikayet Kuyruğu</h1>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <FilterChip href="/admin/sikayetler" active={!status && !dept}>
            Tümü
          </FilterChip>
          {COMPLAINT_STATUSES.map((s) => (
            <FilterChip
              key={s}
              href={buildHref({ status: s })}
              active={status === s}
            >
              {COMPLAINT_STATUS_LABELS[s]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {COMPLAINT_OWNER_DEPTS.map((d) => (
            <FilterChip
              key={d}
              href={buildHref({ dept: d })}
              active={dept === d}
            >
              {COMPLAINT_OWNER_DEPT_LABELS[d]}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {!complaints || complaints.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Kayıt yok.
          </p>
        ) : (
          complaints.map((c) => {
            const company = Array.isArray(c.companies)
              ? c.companies[0]
              : (c.companies as { name: string } | null);
            const reporter = Array.isArray(c.reporter)
              ? c.reporter[0]
              : (c.reporter as { full_name: string } | null);
            return (
              <Link key={c.id} href={`/sikayet/${c.id}`}>
                <Card className="hover:bg-accent">
                  <CardContent className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {company?.name || c.complainant_name || "—"} ·{" "}
                        {COMPLAINT_TYPE_LABELS[c.type as keyof typeof COMPLAINT_TYPE_LABELS]} ·{" "}
                        {COMPLAINT_OWNER_DEPT_LABELS[c.owner_dept as keyof typeof COMPLAINT_OWNER_DEPT_LABELS]} ·{" "}
                        {reporter?.full_name}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={statusVariant[c.status as ComplaintStatus]}
                      >
                        {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {COMPLAINT_PRIORITY_LABELS[c.priority]}
                      </span>
                    </div>
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

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "hover:bg-accent"
      )}
    >
      {children}
    </Link>
  );
}
