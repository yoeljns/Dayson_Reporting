"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { adminDeleteVisit } from "@/app/(admin)/admin/ziyaretler/actions";

/** Admin-only archive control for any visit (incl. completed / other reps'). */
export function AdminVisitDeleteButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      variant="ghost"
      size="icon"
      className="shrink-0 text-destructive"
      title="Sil"
      message="Bu ziyaret arşivlensin mi? Tamamlanmış ziyaretler de silinebilir; Silinenler sayfasından geri alınabilir."
      confirmText="Sil"
      onConfirm={async () => {
        const res = await adminDeleteVisit(visitId);
        if (!res.error) router.refresh();
      }}
    >
      <Trash2 className="h-4 w-4" />
    </ConfirmButton>
  );
}
