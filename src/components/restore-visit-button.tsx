"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { restoreVisit } from "@/app/(admin)/admin/ziyaretler/actions";

/** Admin-only restore control for an archived visit. */
export function RestoreVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      variant="outline"
      size="sm"
      className="shrink-0"
      message="Bu ziyaret geri alınsın mı? Tekrar aktif ziyaretler arasına döner."
      confirmText="Geri al"
      onConfirm={async () => {
        const res = await restoreVisit(visitId);
        if (!res.error) router.refresh();
      }}
    >
      <RotateCcw className="mr-1 h-4 w-4" /> Geri al
    </ConfirmButton>
  );
}
