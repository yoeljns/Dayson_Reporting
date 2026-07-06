"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { VisitType } from "@/lib/enums";

export interface PendingVisit {
  localId: string;
  companyId: string;
  companyName: string;
  visitType: VisitType;
  /** Chosen visit date (YYYY-MM-DD); older queued items may lack it. */
  visitDate?: string;
  createdAt: number;
}

interface DaysonDB extends DBSchema {
  pending_visits: {
    key: string;
    value: PendingVisit;
  };
}

let dbPromise: Promise<IDBPDatabase<DaysonDB>> | null = null;

function getDB() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB yalnızca tarayıcıda kullanılabilir.");
  }
  if (!dbPromise) {
    dbPromise = openDB<DaysonDB>("dayson-offline", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("pending_visits")) {
          db.createObjectStore("pending_visits", { keyPath: "localId" });
        }
      },
    });
  }
  return dbPromise;
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export async function enqueueVisit(
  draft: Omit<PendingVisit, "localId" | "createdAt">
): Promise<PendingVisit> {
  const db = await getDB();
  const record: PendingVisit = {
    ...draft,
    localId: makeId(),
    createdAt: Date.now(),
  };
  await db.put("pending_visits", record);
  return record;
}

export async function getPendingVisits(): Promise<PendingVisit[]> {
  const db = await getDB();
  return db.getAll("pending_visits");
}

export async function removePendingVisit(localId: string): Promise<void> {
  const db = await getDB();
  await db.delete("pending_visits", localId);
}
