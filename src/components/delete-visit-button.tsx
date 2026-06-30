"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteVisit } from "@/app/(app)/ziyaret/actions";

export function DeleteVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();

  return (
    <ConfirmButton
      variant="ghost"
      size="sm"
      className="text-destructive"
      message="Bu taslağı silmek istediğinize emin misiniz? Silinen kayıtlar yönetimde saklanır."
      confirmText="Sil"
      onConfirm={async () => {
        const res = await deleteVisit(visitId);
        if (res.error) return;
        router.push("/");
        router.refresh();
      }}
    >
      <Trash2 className="mr-1 h-4 w-4" />
      Sil
    </ConfirmButton>
  );
}
