"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, Users } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { VISIT_TYPE_LABELS, type VisitType } from "@/lib/enums";
import { cn } from "@/lib/utils";
import { updateVisitType } from "@/app/(app)/ziyaret/actions";

/** One-tap visit type switch in the visit header (owner only). */
export function VisitTypeToggle({ visitId, visitType }: { visitId: string; visitType: VisitType }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const next: VisitType = visitType === "telefon" ? "yuz_yuze" : "telefon";
  const Icon = visitType === "telefon" ? Phone : Users;
  return (
    <button
      type="button"
      disabled={pending}
      title={`${VISIT_TYPE_LABELS[next]} olarak değiştir`}
      onClick={() =>
        startTransition(async () => {
          const res = await updateVisitType({ visitId, visitType: next });
          if (res.error) toast(res.error, "warn");
          else router.refresh();
        })
      }
      className={cn(
        "inline-flex items-center gap-1 rounded px-1 text-foreground underline decoration-dotted underline-offset-2 hover:bg-accent print:no-underline",
        pending && "opacity-60"
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {VISIT_TYPE_LABELS[visitType]}
    </button>
  );
}
