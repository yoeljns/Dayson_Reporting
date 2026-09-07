"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLAN_STATUS_LABELS, PLAN_STATUS_BADGE, type PlanStatus } from "@/lib/enums";
import { ensurePlan } from "@/app/(app)/plan/actions";

type Week = {
  weekStart: string;
  label: string;
  isCurrent: boolean;
  planId: string | null;
  status: PlanStatus | null;
  count: number;
};

export function PlanWeekPicker({ weeks }: { weeks: Week[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function open(week: Week) {
    if (week.planId) {
      router.push(`/plan/${week.planId}`);
      return;
    }
    startTransition(async () => {
      const res = await ensurePlan(week.weekStart);
      if (res.id) router.push(`/plan/${res.id}`);
    });
  }

  return (
    <div className="space-y-2">
      {weeks.map((w) => (
        <button
          key={w.weekStart}
          type="button"
          disabled={pending}
          onClick={() => open(w)}
          className="w-full text-left disabled:opacity-60"
        >
          <Card className="hover:bg-accent">
            <CardContent className="flex items-center justify-between p-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {w.label}
                  {w.isCurrent && (
                    <Badge variant="secondary">Bu hafta</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {w.planId ? `${w.count} firma` : "Plan oluşturmak için dokun"}
                </div>
              </div>
              {w.planId ? (
                <Badge variant={PLAN_STATUS_BADGE[w.status ?? "taslak"]}>
                  {PLAN_STATUS_LABELS[w.status ?? "taslak"]}
                </Badge>
              ) : (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Plus className="h-4 w-4" />
                </span>
              )}
              <ChevronRight className="ml-1 h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}
