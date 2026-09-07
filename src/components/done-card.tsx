"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

/** "Ziyaret tamamlandı · ZY-1234" confirmation after the wizard redirects home. */
export function DoneCard() {
  const params = useSearchParams();
  const router = useRouter();
  const done = params.get("done");
  const [visible, setVisible] = useState(Boolean(done));

  useEffect(() => setVisible(Boolean(done)), [done]);
  if (!visible || !done) return null;

  function dismiss() {
    setVisible(false);
    router.replace("/");
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-[hsl(var(--success-soft))] p-3 text-[hsl(var(--success))]">
      <CheckCircle2 className="h-6 w-6 shrink-0" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">Ziyaret tamamlandı · {done}</div>
        <div className="text-xs opacity-80">
          Kayıt <Link href="/ziyaretler" className="underline">Ziyaretler</Link>{" "}
          listesinde. Yeni bir ziyarete başlayabilirsin.
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 opacity-70 hover:opacity-100"
        aria-label="Kapat"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
