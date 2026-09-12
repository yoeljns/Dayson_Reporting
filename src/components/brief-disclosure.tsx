"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const KEY = "dayson:brief-open";

/** Collapsible "Başlamadan önce" wrapper; open/closed choice is remembered on the device. */
export function BriefDisclosure({ title = "Başlamadan önce", children }: { title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "0") setOpen(false);
    } catch {
      /* storage unavailable */
    }
  }, []);
  function toggle() {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY, o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });
  }
  return (
    <Card>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium"
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open ? "rotate-180" : "")} />
      </button>
      {open && <CardContent className="pb-3 pt-0">{children}</CardContent>}
    </Card>
  );
}
