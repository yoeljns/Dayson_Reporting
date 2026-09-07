"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw, AlertTriangle, Trash2 } from "lucide-react";
import {
  listOps,
  replayAll,
  noteQueueChanged,
  dropFailed,
  retryFailed,
  isOnline,
  MAX_TRIES,
  QUEUE_EVENT,
  QUEUE_CHANGED_EVENT,
  OWNER_KEY,
  type Op,
} from "@/lib/offline";
import { purgeCaches } from "@/lib/offline/purge";

/**
 * Sync badge: "N kayıt bekliyor / Şimdi gönder / Gönderiliyor… / N kayıt
 * gönderilemedi / Çevrimdışı". Replays the queue on mount and whenever the
 * device comes back online. On a user switch the previous user's queue and
 * page cache are purged.
 */
export function OfflineSync({ userId }: { userId: string }) {
  const router = useRouter();
  const [ops, setOps] = useState<Op[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setOps((await listOps()).filter((o) => !o.ownerId || o.ownerId === userId));
    } catch {
      /* IndexedDB unavailable — ignore */
    }
  }, [userId]);

  const flush = useCallback(async () => {
    if (!isOnline()) return;
    setSyncing(true);
    try {
      const res = await replayAll(userId);
      await refresh();
      if (res.sent > 0) router.refresh();
    } finally {
      setSyncing(false);
    }
  }, [refresh, router, userId]);

  // On a user switch purge the previous user's cached pages. Queued ops are
  // owner-tagged and only replayed by their owner, so they are kept — a rep's
  // unsent field data must survive a colleague signing in on the same phone.
  useEffect(() => {
    try {
      const prev = localStorage.getItem(OWNER_KEY);
      if (prev && prev !== userId) void purgeCaches();
      localStorage.setItem(OWNER_KEY, userId);
    } catch {
      /* private mode */
    }
  }, [userId]);

  useEffect(() => {
    setOnline(isOnline());
    refresh();
    flush();
    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    const onChange = () => refresh();
    // An op queued while the browser still reports "online" (flaky signal):
    // retry shortly, and again whenever the app comes back to the foreground.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAdded = () => {
      noteQueueChanged();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => flush(), 4000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(QUEUE_EVENT, onChange);
    window.addEventListener(QUEUE_CHANGED_EVENT, onAdded);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(QUEUE_EVENT, onChange);
      window.removeEventListener(QUEUE_CHANGED_EVENT, onAdded);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, flush]);

  const failed = ops.filter((o) => o.tries >= MAX_TRIES);
  const waiting = ops.filter((o) => o.tries < MAX_TRIES);

  if (ops.length === 0 && online) return null;

  if (ops.length === 0 && !online) {
    return (
      <div className="flex items-center gap-2 bg-muted px-4 py-1.5 text-xs text-muted-foreground print:hidden">
        <CloudOff className="h-3.5 w-3.5" /> Çevrimdışı — girdiğiniz kayıtlar cihazda
        saklanır, bağlantı gelince gönderilir.
      </div>
    );
  }

  return (
    <div className="space-y-1 bg-amber-100 px-4 py-2 text-sm text-amber-900 print:hidden dark:bg-amber-900/40 dark:text-amber-100">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <CloudOff className="h-4 w-4" />
          {!online
            ? `Çevrimdışı · ${ops.length} kayıt bekliyor`
            : syncing
              ? "Gönderiliyor…"
              : waiting.length > 0
                ? `${waiting.length} kayıt gönderilmeyi bekliyor`
                : `${failed.length} kayıt gönderilemedi`}
        </span>
        {online && waiting.length > 0 && (
          <button
            onClick={flush}
            disabled={syncing}
            className="flex items-center gap-1 font-medium underline"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Şimdi gönder
          </button>
        )}
      </div>
      {failed.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {failed.length} kayıt {MAX_TRIES} denemede gönderilemedi
            {failed[0]?.error ? `: ${failed[0].error}` : ""}
          </span>
          <span className="flex gap-3">
            <button
              className="underline"
              onClick={() => retryFailed().then(flush)}
              disabled={syncing}
            >
              Tekrar dene
            </button>
            <button
              className="flex items-center gap-1 underline"
              onClick={() => dropFailed(MAX_TRIES).then(refresh)}
              disabled={syncing}
            >
              <Trash2 className="h-3 w-3" /> Hatalıları sil
            </button>
          </span>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="truncate text-xs opacity-80">
          {waiting.slice(0, 3).map((o) => o.label).join(" · ")}
          {waiting.length > 3 ? ` · +${waiting.length - 3}` : ""}
        </div>
      )}
    </div>
  );
}
