"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "info";
type Toast = { id: number; message: string; tone: Tone };

const ToastCtx = createContext<{
  toast: (message: string, tone?: Tone) => void;
} | null>(null);

/** Short bottom-right notice ("Ziyaret tamamlandı · ZY-3F9A"). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback(
    (id: number) => setItems((l) => l.filter((t) => t.id !== id)),
    []
  );
  const toast = useCallback(
    (message: string, tone: Tone = "ok") => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-2), { id, message, tone }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-2 sm:bottom-4 sm:right-4 sm:left-auto print:hidden"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-lg",
              t.tone === "ok" && "border-green-300",
              t.tone === "warn" && "border-amber-300",
              t.tone === "info" && "border-border"
            )}
          >
            {t.tone === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
            ) : t.tone === "warn" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  // Outside a provider (tests, isolated renders) fall back to a no-op.
  return ctx ?? { toast: () => {} };
}
