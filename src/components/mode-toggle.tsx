"use client";

import { useState, useTransition } from "react";
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
  const [on, setOn] = useState(managementMode);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic — the header must not feel laggy
    startTransition(async () => {
      const res = await setManagementMode(next);
      if (res.error) {
        setOn(!next);
        return;
      }
      router.replace(next ? "/admin" : "/");
      router.refresh();
    });
  }

  return (
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
  );
}
