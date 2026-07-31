"use client";

import { Printer } from "lucide-react";

/** Prints the current page. Hidden in the printout itself. */
export function PrintButton({ label = "Yazdır" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent print:hidden"
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
