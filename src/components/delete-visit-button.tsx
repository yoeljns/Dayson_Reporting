"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteVisit } from "@/app/(app)/ziyaret/actions";

export function DeleteVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (
      !window.confirm(
        "Bu taslağı silmek istediğinize emin misiniz? Silinen kayıtlar yönetimde saklanır."
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteVisit(visitId);
      if (res.error) {
        alert(res.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive"
      disabled={pending}
      onClick={onClick}
    >
      <Trash2 className="mr-1 h-4 w-4" />
      Sil
    </Button>
  );
}
