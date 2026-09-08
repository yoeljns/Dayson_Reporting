"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Önceki / Sıradaki bar for company detail pages — walks the list the user
 * came from (meeting mode). ← / → keys work when no field is focused.
 */
export function CompanyNav({
  prevHref,
  prevName,
  nextHref,
  nextName,
  index,
  total,
}: {
  prevHref: string | null;
  prevName: string | null;
  nextHref: string | null;
  nextName: string | null;
  index: number;
  total: number;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      if (e.key === "ArrowLeft" && prevHref) router.push(prevHref);
      else if (e.key === "ArrowRight" && nextHref) router.push(nextHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router]);

  const btn = "flex min-w-0 items-center gap-1 rounded-md border px-2 py-1.5 text-sm";
  return (
    <div className="flex items-center justify-between gap-2 print:hidden">
      {prevHref ? (
        <Link href={prevHref} className={cn(btn, "hover:bg-accent")} title={prevName ?? "Önceki"}>
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">
            <span className="hidden sm:inline">Önceki: </span>
            {prevName ?? "Önceki"}
          </span>
        </Link>
      ) : (
        <span className={cn(btn, "text-muted-foreground opacity-50")}>
          <ChevronLeft className="h-4 w-4" /> Önceki
        </span>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {index} / {total}
      </span>
      {nextHref ? (
        <Link href={nextHref} className={cn(btn, "justify-end text-right hover:bg-accent")} title={nextName ?? "Sıradaki"}>
          <span className="truncate">
            <span className="hidden sm:inline">Sıradaki: </span>
            {nextName ?? "Sıradaki"}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      ) : (
        <span className={cn(btn, "text-muted-foreground opacity-50")}>
          Sıradaki <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}
