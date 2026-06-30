"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand logo. Shows a clean wordmark by default and swaps to /logo.png ONLY
 * once that file actually loads — so a missing logo never shows a broken image.
 * Drop the real logo at public/logo.png to use it.
 */
export function Logo({
  className,
  height = 28,
}: {
  className?: string;
  height?: number;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <span className="inline-flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Dayson Avrupa Group"
        style={{ height, width: "auto", display: loaded ? "block" : "none" }}
        className={cn("block rounded-md bg-white p-1", className)}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
      />
      {!loaded && (
        <span className={cn("font-serif text-lg font-semibold", className)}>
          Avrupa <span className="text-primary">Group</span>
        </span>
      )}
    </span>
  );
}
