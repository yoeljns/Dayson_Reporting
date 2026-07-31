"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { setManagementMode } from "@/app/(app)/hesap/actions";

/**
 * Switches a manager/admin between management (viewing) mode and reporting
 * mode. Rendered in the header so it is in the same place on phone and web.
 * Deliberately a labelled button rather than a bare switch — the current mode
 * has to be readable at a glance.
 */
export function ModeToggle({
  managementMode,
  className,
}: {
  managementMode: boolean;
  className?: string;
}) {
  const router = useRouter();
  // Optimistic override on top of the server value. Two instances of this
  // button can be on screen at once (header + /hesap card), so the server prop
  // stays the source of truth and the override is dropped as soon as it lands.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const on = optimistic ?? managementMode;

  useEffect(() => setOptimistic(null), [managementMode]);

  function toggle() {
    const next = !on;
    setOptimistic(next); // the header must not feel laggy
    setError(null);
    startTransition(async () => {
      try {
        const res = await setManagementMode(next);
        if (res.error) {
          setOptimistic(null);
          setError(res.error);
          return;
        }
        router.replace(next ? "/admin" : "/");
        router.refresh();
      } catch {
        // Offline / network drop: undo the optimistic flip and say so.
        setOptimistic(null);
        setError("Bağlantı yok, mod değiştirilemedi.");
      }
    });
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={
        on
          ? "Şu an yönetim modundasınız. Ziyaret/şikayet girmek için dokunun."
          : "Şu an raporlama modundasınız. Yönetim ekranlarına dönmek için dokunun."
      }
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-60",
        on
          ? "border-primary/40 bg-primary/10 text-primary"
          : "hover:bg-accent",
        className
      )}
    >
      {on ? (
        <Eye className="h-4 w-4 shrink-0" />
      ) : (
        <PencilLine className="h-4 w-4 shrink-0" />
      )}
      <span>{on ? "Yönetim" : "Raporlama"}</span>
      </button>
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </span>
  );
}
