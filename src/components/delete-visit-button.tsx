"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteVisit } from "@/app/(app)/ziyaret/actions";

export function DeleteVisitButton({
  visitId,
  completed = false,
}: {
  visitId: string;
  completed?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
    <ConfirmButton
      variant="ghost"
      size="sm"
      className="text-destructive"
      message={
        completed
          ? "Bu ziyaret silinsin mi? Hatalı girilen ziyaretler için kullanın; yönetim gerekirse geri alabilir."
          : "Bu taslak silinsin mi? Silinen kayıtlar yönetimde saklanır."
      }
      confirmText="Sil"
      onConfirm={async () => {
        const res = await deleteVisit(visitId);
        if (res.error) {
          setError(res.error);
          return;
        }
        router.push("/");
        router.refresh();
      }}
    >
      <Trash2 className="mr-1 h-4 w-4" />
      Sil
    </ConfirmButton>
    {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
