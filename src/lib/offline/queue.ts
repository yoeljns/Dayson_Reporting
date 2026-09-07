"use client";

import { getDB } from "./db";
import { newId } from "@/lib/uuid";
import { QUEUE_EVENT, type Op, type QueuedPhoto } from "./types";

export function notifyQueue() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
}
export const QUEUE_CHANGED_EVENT = "dayson:offline-queue-added";

/** Add an op; same coalesceKey replaces the older one (keeps its createdAt). */
export async function enqueue(
  op: Omit<Op, "id" | "createdAt" | "tries"> & { id?: string }
): Promise<Op> {
  const db = await getDB();
  // One readwrite transaction: coalesce + insert atomically, and keep
  // createdAt strictly increasing so replay order matches enqueue order even
  // for same-millisecond enqueues (form op, then its photos op).
  const tx = db.transaction("ops", "readwrite");
  const all = await tx.store.getAll();
  let createdAt = Date.now();
  const maxExisting = all.reduce((m, o) => Math.max(m, o.createdAt), 0);
  if (createdAt <= maxExisting) createdAt = maxExisting + 1;
  if (op.coalesceKey) {
    for (const o of all) {
      if (o.coalesceKey === op.coalesceKey) {
        createdAt = o.createdAt; // keep the original slot
        await tx.store.delete(o.id);
      }
    }
  }
  const rec: Op = { ...op, id: op.id ?? newId(), createdAt, tries: 0 };
  await tx.store.put(rec);
  await tx.done;
  notifyQueue();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  return rec;
}

export async function listOps(): Promise<Op[]> {
  const db = await getDB();
  return db.getAllFromIndex("ops", "byCreatedAt");
}

export async function updateOp(op: Op): Promise<void> {
  const db = await getDB();
  await db.put("ops", op);
}

export async function removeOp(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("ops", id);
  notifyQueue();
}

export async function putPhoto(p: QueuedPhoto): Promise<void> {
  const db = await getDB();
  await db.put("photos", p);
}

export async function getPhoto(documentId: string): Promise<QueuedPhoto | undefined> {
  const db = await getDB();
  return db.get("photos", documentId);
}

export async function deletePhoto(documentId: string): Promise<void> {
  const db = await getDB();
  await db.delete("photos", documentId);
}

/** Wipe everything (user switch / sign-out). */
export async function clearAll(): Promise<void> {
  const db = await getDB();
  await db.clear("ops");
  await db.clear("photos");
  notifyQueue();
}

/** Drop ops that exhausted their retries (and their blobs). */
export async function dropFailed(maxTries: number): Promise<number> {
  const db = await getDB();
  const all = await db.getAll("ops");
  let n = 0;
  for (const o of all) {
    if (o.tries >= maxTries) {
      if (o.kind === "visit.photos") {
        const p = o.payload as { documentIds: string[] };
        for (const d of p.documentIds) await db.delete("photos", d);
      }
      await db.delete("ops", o.id);
      n++;
    }
  }
  notifyQueue();
  return n;
}

/** Reset tries so failed ops get another round. */
export async function retryFailed(): Promise<void> {
  const db = await getDB();
  const all = await db.getAll("ops");
  for (const o of all) {
    if (o.tries > 0) await db.put("ops", { ...o, tries: 0, error: undefined });
  }
  notifyQueue();
}
