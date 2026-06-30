"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand logo. Shows /logo.png; falls back to a wordmark only if the image is
 * missing/broken. Handles the cached-image case (where onLoad may not fire) via
 * a mount check on the element's `complete`/`naturalWidth`.
 */
export function Logo({
  className,
  height = 32,
}: {
  className?: string;
  height?: number;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete) {
      setStatus(img.naturalWidth > 0 ? "ok" : "error");
    }
  }, []);

  return (
    <span className="inline-flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src="/logo.png?v=3"
        alt="Dayson Avrupa Group"
        style={{
          height,
          width: "auto",
          display: status === "error" ? "none" : "block",
        }}
        className={cn("rounded-md bg-white p-1", className)}
        onLoad={() => setStatus("ok")}
        onError={() => setStatus("error")}
      />
      {status === "error" && (
        <span className={cn("font-serif text-lg font-semibold", className)}>
          Avrupa <span className="text-primary">Group</span>
        </span>
      )}
    </span>
  );
}
