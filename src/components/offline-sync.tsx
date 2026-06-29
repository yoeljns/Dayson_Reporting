"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import {
  getPendingVisits,
  removePendingVisit,
  type PendingVisit,
} from "@/lib/offline";
import { createDraftVisit } from "@/app/(app)/ziyaret/actions";

/**
 * Banner shown when there are visits queued offline. Auto-flushes the queue
 * whenever the device comes back online (and on mount).
 */
export function OfflineSync() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingVisit[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPending(await getPendingVisits());
    } catch {
      /* IndexedDB unavailable — ignore */
    }
  }, []);

  const flush = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setSyncing(true);
    try {
      const items = await getPendingVisits();
      for (const item of items) {
        const res = await createDraftVisit({
          companyId: item.companyId,
          visitType: item.visitType,
        });
        if (res.id) await removePendingVisit(item.localId);
      }
      await refresh();
      if (items.length > 0) router.refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh, router]);

  useEffect(() => {
    refresh();
    flush();
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    const onChange = () => refresh();
    window.addEventListener("dayson:offline-queue", onChange);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("dayson:offline-queue", onChange);
    };
  }, [refresh, flush]);

  if (pending.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-2">
        <CloudOff className="h-4 w-4" />
        {pending.length} taslak gönderilmeyi bekliyor
      </span>
      <button
        onClick={flush}
        disabled={syncing}
        className="flex items-center gap-1 font-medium underline"
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
        Şimdi gönder
      </button>
    </div>
  );
}
