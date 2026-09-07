"use client";

import { enqueue, putPhoto, listOps } from "./queue";
import { OWNER_KEY, type FormKind, type PhotosOpPayload, type VisitOpPayload } from "./types";
import type { DocumentRefTable } from "@/lib/enums";
import type { UploadedPhoto } from "@/components/photo-uploader";

/** Signed-in user id as recorded by the sync badge on mount ("" if unknown). */
export function currentOwnerId(): string {
  try {
    return localStorage.getItem(OWNER_KEY) ?? "";
  } catch {
    return "";
  }
}

export async function queueVisit(label: string, payload: VisitOpPayload) {
  return enqueue({
    kind: "visit",
    label,
    coalesceKey: `visit:${payload.visitId}`,
    ownerId: currentOwnerId(),
    payload,
  });
}

/** Store a resized photo blob for later upload. */
export async function queuePhotoBlob(p: {
  documentId: string;
  refTable: DocumentRefTable;
  refId: string;
  blob: Blob;
  mime: string;
}) {
  await putPhoto({ ...p, ownerId: currentOwnerId(), createdAt: Date.now() });
}

/**
 * Photos op for a record: blobs queued offline get uploaded + attached;
 * photos already in Storage (form failed after upload) only get attached.
 */
export async function queuePhotos(
  label: string,
  refTable: DocumentRefTable,
  refId: string,
  photos: UploadedPhoto[]
) {
  const queued = photos.filter((p) => p.status === "queued").map((p) => p.documentId);
  const uploaded = photos
    .filter((p) => p.status === "uploaded")
    .map(({ documentId, path, mime, sizeBytes }) => ({ documentId, path, mime, sizeBytes }));
  if (queued.length === 0 && uploaded.length === 0) return null;
  // Merge with a pending op for the same record (photos added one at a time).
  const key = `photos:${refTable}:${refId}`;
  const prev = (await listOps()).find((o) => o.coalesceKey === key);
  const prevPayload = prev?.payload as PhotosOpPayload | undefined;
  const payload: PhotosOpPayload = {
    refTable,
    refId,
    documentIds: Array.from(new Set([...(prevPayload?.documentIds ?? []), ...queued])),
    done: prevPayload?.done ?? [],
    uploaded: [
      ...(prevPayload?.uploaded ?? []),
      ...uploaded.filter(
        (u) => !(prevPayload?.uploaded ?? []).some((x) => x.documentId === u.documentId)
      ),
    ],
  };
  return enqueue({
    kind: "visit.photos",
    label: `${label} · fotoğraf`,
    coalesceKey: key,
    ownerId: currentOwnerId(),
    payload,
  });
}

/** Queue a form submit (complaint, competitor, stock, survey, company). */
export async function queueForm(
  form: FormKind,
  label: string,
  input: Record<string, unknown>,
  photos?: { refTable: DocumentRefTable; refId: string; list: UploadedPhoto[] }
) {
  const op = await enqueue({
    kind: "form",
    label,
    coalesceKey: input.clientId || input.id ? `form:${form}:${input.clientId ?? input.id}` : undefined,
    ownerId: currentOwnerId(),
    payload: { form, input },
  });
  if (photos) await queuePhotos(label, photos.refTable, photos.refId, photos.list);
  return op;
}

export const OFFLINE_SAVED_MSG =
  "Çevrimdışı kaydedildi — bağlantı gelince otomatik gönderilecek.";
