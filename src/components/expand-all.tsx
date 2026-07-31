"use client";

import { useEffect, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

/**
 * Opens/closes every <details> inside the given container. Older visits stay
 * collapsed by default; this is the one tap that unfolds the whole file for a
 * meeting. Printing also unfolds them — a printout of summary lines is useless.
 */
export function ExpandAll({ targetId }: { targetId: string }) {
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    // The browser's own print (Ctrl+P) must show the full record too.
    const onBeforePrint = () => {
      document
        .querySelectorAll<HTMLDetailsElement>("details")
        .forEach((d) => (d.open = true));
    };
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, []);

  function toggle() {
    const root = document.getElementById(targetId);
    if (!root) return;
    const items = root.querySelectorAll<HTMLDetailsElement>("details");
    // Derive the action from the DOM, not from local state — the user may have
    // opened or closed individual rows by hand since the last click.
    const anyClosed = [...items].some((d) => !d.open);
    items.forEach((d) => (d.open = anyClosed));
    setAllOpen(anyClosed);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent print:hidden"
    >
      {allOpen ? (
        <ChevronsDownUp className="h-4 w-4" />
      ) : (
        <ChevronsUpDown className="h-4 w-4" />
      )}
      {allOpen ? "Tümünü kapat" : "Tümünü aç"}
    </button>
  );
}
