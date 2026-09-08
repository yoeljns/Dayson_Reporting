"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/ui/toast";
import { isOnline } from "@/lib/offline";
import { deleteComplaint } from "@/app/(app)/sikayet/actions";
import { deleteObservation } from "@/app/(app)/rakip/actions";
import { deleteStockCount } from "@/app/(app)/stok/actions";

type Kind = "complaint" | "observation" | "stock";
const LABEL: Record<Kind, string> = {
  complaint: "Şikayet",
  observation: "Rakip bilgisi",
  stock: "Stok sayımı",
};

/** Delete a field record (owner or manager) and go back to a list. */
export function DeleteRecordButton({
  kind,
  id,
  redirectTo,
  size = "sm",
}: {
  kind: Kind;
  id: string;
  redirectTo: string;
  size?: "sm" | "icon";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    if (!isOnline()) {
      setError("Silmek için bağlantı gerekli — bağlantı gelince tekrar deneyin.");
      return;
    }
    const res =
      kind === "complaint"
        ? await deleteComplaint({ complaintId: id })
        : kind === "observation"
          ? await deleteObservation({ observationId: id })
          : await deleteStockCount({ stockCountId: id });
    if (res.error) {
      setError(res.error);
      return;
    }
    toast(`${LABEL[kind]} silindi`, "ok");
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <ConfirmButton
        variant="outline"
        size={size}
        className="text-destructive"
        message={`${LABEL[kind]} kalıcı olarak silinsin mi? Fotoğraf ve dosyaları da silinir.`}
        confirmText="Sil"
        onConfirm={run}
      >
        <Trash2 className={size === "icon" ? "h-4 w-4" : "mr-1 h-4 w-4"} />
        {size !== "icon" && "Sil"}
      </ConfirmButton>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
