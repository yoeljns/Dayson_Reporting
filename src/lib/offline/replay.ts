"use client";

import { listOps, updateOp, removeOp, getPhoto, deletePhoto, notifyQueue } from "./queue";
import { isNetworkError, isOnline } from "./net";
import {
  MAX_TRIES,
  type Op,
  type VisitOpPayload,
  type PhotosOpPayload,
  type FormOpPayload,
} from "./types";
import {
  createDraftVisit,
  recordVisitMetric,
  saveVisitProducts,
  setVisitContact,
  saveVisit,
  registerCompanyFromField,
} from "@/app/(app)/ziyaret/actions";
import { saveComplaint } from "@/app/(app)/sikayet/actions";
import { saveObservation } from "@/app/(app)/rakip/actions";
import { saveStockCount } from "@/app/(app)/stok/actions";
import { saveSurveyAnswer } from "@/app/(app)/anket/actions";
import { attachPhotos } from "@/app/(app)/foto/actions";
import { uploadPhotoBlob } from "@/components/photo-uploader";

export type ReplaySummary = { sent: number; failed: number; stopped: boolean };

/** Throws on network error (caller stops the run); returns a message otherwise. */
async function runOp(op: Op): Promise<string | null> {
  if (op.kind === "visit") {
    const p = op.payload as VisitOpPayload;
    if (p.create) {
      const r = await createDraftVisit({
        id: p.visitId,
        companyId: p.companyId,
        visitType: p.visitType,
        visitDate: p.visitDate,
      });
      if (r.error) return r.error;
    }
    if (p.bare) return null;
    const r1 = await saveVisitProducts({ visitId: p.visitId, selections: p.selections });
    if (r1.error) return r1.error;
    const r2 = await setVisitContact({ visitId: p.visitId, contactId: p.contactId });
    if (r2.error) return r2.error;
    const r3 = await saveVisit({ visitId: p.visitId, answers: p.answers, complete: p.complete, location: p.location ?? null });
    if (r3.error) return r3.error;
    return null;
  }

  if (op.kind === "visit.photos") {
    const p = op.payload as PhotosOpPayload;
    const pendingAttach = (p.uploaded ?? []).filter((u) => !p.done.includes(u.documentId));
    if (pendingAttach.length > 0) {
      const att = await attachPhotos({ refTable: p.refTable, refId: p.refId, photos: pendingAttach });
      if (att.error) return att.error;
      p.done.push(...pendingAttach.map((u) => u.documentId));
      await updateOp({ ...op, payload: p });
    }
    for (const documentId of p.documentIds) {
      if (p.done.includes(documentId)) continue;
      const photo = await getPhoto(documentId);
      if (!photo) {
        // Blob gone (storage evicted) — nothing to send; count as done.
        p.done.push(documentId);
        continue;
      }
      const up = await uploadPhotoBlob({
        refTable: p.refTable,
        refId: p.refId,
        documentId,
        blob: photo.blob,
        mime: photo.mime,
      });
      if (up.error) {
        if (isNetworkError(up.error)) throw new Error(up.error);
        return up.error;
      }
      const att = await attachPhotos({
        refTable: p.refTable,
        refId: p.refId,
        photos: [
          { documentId, path: up.path!, mime: photo.mime, sizeBytes: photo.blob.size },
        ],
      });
      if (att.error) return att.error;
      p.done.push(documentId);
      await deletePhoto(documentId);
      await updateOp({ ...op, payload: p }); // partial progress survives a crash
    }
    return null;
  }

  const f = op.payload as FormOpPayload;
  const input = f.input as never;
  let r: { error?: string };
  switch (f.form) {
    case "sikayet":
      r = await saveComplaint(input);
      break;
    case "rakip":
      r = await saveObservation(input);
      break;
    case "stok":
      r = await saveStockCount(input);
      break;
    case "anket":
      r = await saveSurveyAnswer(input);
      break;
    case "firma":
      r = await registerCompanyFromField(input);
      break;
    case "metrik": {
      const r = await recordVisitMetric(f.input as Parameters<typeof recordVisitMetric>[0]);
      return r.error ?? null;
    }
    default:
      return "Bilinmeyen kayıt türü.";
  }
  return r.error ?? null;
}

let inFlight: Promise<ReplaySummary> | null = null;

/**
 * Send queued ops in creation order. One run at a time. A network error stops
 * the run without touching `tries`; any other error bumps `tries` and moves
 * on. Ops of another user are skipped.
 */
export function replayAll(ownerId: string): Promise<ReplaySummary> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const summary: ReplaySummary = { sent: 0, failed: 0, stopped: false };
    if (!isOnline()) return summary;
    let ops: Op[] = [];
    try {
      ops = await listOps();
    } catch {
      return summary;
    }
    for (const op of ops) {
      if (op.ownerId && op.ownerId !== ownerId) continue;
      if (op.tries >= MAX_TRIES) {
        summary.failed++;
        continue;
      }
      try {
        const err = await runOp(op);
        if (err) {
          if (isNetworkError(err)) throw new Error(err);
          await updateOp({ ...op, tries: op.tries + 1, error: err });
          summary.failed++;
          continue;
        }
        if (op.kind === "visit.photos") {
          for (const d of (op.payload as PhotosOpPayload).documentIds) await deletePhoto(d);
        }
        await removeOp(op.id);
        summary.sent++;
      } catch (e) {
        if (isNetworkError(e)) {
          summary.stopped = true;
          break;
        }
        await updateOp({
          ...op,
          tries: op.tries + 1,
          error: e instanceof Error ? e.message : "Gönderilemedi",
        });
        summary.failed++;
      }
    }
    notifyQueue();
    return summary;
  })().finally(() => {
    inFlight = null;
    // Ops enqueued during the run were not in the snapshot — send them now.
    if (pendingRerun) {
      pendingRerun = false;
      void replayAll(ownerId);
    }
  });
  return inFlight;
}

let pendingRerun = false;
/** Called by the queue when an op is added while a run is in flight. */
export function noteQueueChanged() {
  if (inFlight) pendingRerun = true;
}
