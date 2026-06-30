"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand logo. Renders /logo.png (or /logo.svg) when present; falls back to a
 * styled wordmark until the real asset is added to /public.
 */
export function Logo({
  className,
  height = 28,
}: {
  className?: string;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/logo.png"
        alt="Dayson Avrupa Group"
        style={{ height, width: "auto" }}
        className={cn("block", className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={cn("font-serif text-lg font-semibold", className)}>
      Dayson <span className="text-primary">Avrupa</span>
    </span>
  );
}
