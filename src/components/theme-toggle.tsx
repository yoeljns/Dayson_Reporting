"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { setTheme } from "@/app/(app)/hesap/actions";
import type { Theme } from "@/lib/theme";

export function ThemeToggle({ theme }: { theme: Theme }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function pick(t: Theme) {
    document.documentElement.classList.toggle("dark", t === "dark");
    startTransition(async () => {
      await setTheme(t);
      router.refresh();
    });
  }
  const btn = (t: Theme, label: string, Icon: typeof Sun) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => pick(t)}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
        theme === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
  return (
    <div className="flex gap-2">
      {btn("light", "Açık", Sun)}
      {btn("dark", "Koyu", Moon)}
    </div>
  );
}
