"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Op, QueuedPhoto } from "./types";

interface DaysonDB extends DBSchema {
  ops: {
    key: string;
    value: Op;
    indexes: { byCreatedAt: number };
  };
  photos: {
    key: string;
    value: QueuedPhoto;
  };
}

/** Shape of the v1 store, migrated into `ops` on upgrade. */
type LegacyPendingVisit = {
  localId: string;
  companyId: string;
  companyName: string;
  visitType: "telefon" | "yuz_yuze";
  visitDate?: string;
  createdAt: number;
};

let dbPromise: Promise<IDBPDatabase<DaysonDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<DaysonDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB yalnızca tarayıcıda kullanılabilir."));
  }
  if (!dbPromise) {
    dbPromise = openDB<DaysonDB>("dayson-offline", 2, {
      // Another tab/PWA window holds an older version: let it upgrade.
      blocking(_cur, _blocked, event) {
        (event.target as IDBDatabase | null)?.close();
        dbPromise = null;
      },
      upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains("ops")) {
          const ops = db.createObjectStore("ops", { keyPath: "id" });
          ops.createIndex("byCreatedAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("photos")) {
          db.createObjectStore("photos", { keyPath: "documentId" });
        }
        // v1 → v2: carry queued bare drafts over as visit ops. Everything
        // happens inside the versionchange transaction (no foreign awaits).
        if (oldVersion < 2 && db.objectStoreNames.contains("pending_visits" as never)) {
          const legacy = tx.objectStore("pending_visits" as never) as unknown as {
            getAll(): Promise<LegacyPendingVisit[]>;
          };
          const ops = tx.objectStore("ops");
          void legacy.getAll().then((rows) => {
            for (const r of rows) {
              const id =
                /^[0-9a-f-]{36}$/i.test(r.localId) ? r.localId : crypto.randomUUID();
              void ops.put({
                id,
                kind: "visit",
                label: `Ziyaret · ${r.companyName}`,
                coalesceKey: `visit:${id}`,
                ownerId: "", // unknown → replayed by whoever is signed in
                createdAt: r.createdAt ?? Date.now(),
                tries: 0,
                payload: {
                  visitId: id,
                  create: true,
                  companyId: r.companyId,
                  visitType: r.visitType,
                  visitDate: r.visitDate ?? new Date().toISOString().slice(0, 10),
                  answers: [],
                  selections: [],
                  contactId: null,
                  bare: true,
                  complete: false,
                },
              });
            }
            db.deleteObjectStore("pending_visits" as never);
          }).catch(() => {
            /* migration failure is non-fatal; legacy store stays for next open */
          });
        }
      },
    }).catch((e) => {
      dbPromise = null; // don't memoise a failed open (quota, blocked, …)
      throw e;
    });
  }
  return dbPromise;
}
