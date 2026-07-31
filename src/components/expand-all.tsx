"use client";

import { useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

/**
 * Opens/closes every <details> inside the given container id. Older visits stay
 * collapsed by default; this is the one tap that unfolds the whole file before
 * a meeting or a printout.
 */
export function ExpandAll({ targetId }: { targetId: string }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    const root = document.getElementById(targetId);
    if (!root) return;
    const next = !open;
    root.querySelectorAll("details").forEach((d) => {
      d.open = next;
    });
    setOpen(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent print:hidden"
    >
      {open ? (
        <ChevronsDownUp className="h-4 w-4" />
      ) : (
        <ChevronsUpDown className="h-4 w-4" />
      )}
      {open ? "Tümünü kapat" : "Tümünü aç"}
    </button>
  );
}
