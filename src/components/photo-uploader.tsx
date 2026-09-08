"use client";

import { useRef, useState } from "react";
import { Camera, FileText, ImagePlus, Loader2, X, AlertTriangle, CloudOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  PDF_MAX_BYTES,
  PDF_MIME,
  PHOTO_BUCKET,
  PHOTO_MAX_BYTES,
  isPdfMime,
  type DocumentRefTable,
} from "@/lib/enums";
import { newId } from "@/lib/uuid";
import { resizePhoto } from "@/lib/photos/resize";
import { photoPath } from "@/lib/photos/path";
import {
  attachPhotos,
  createPhotoUploadTicket,
  type PhotoAttachInput,
} from "@/app/(app)/foto/actions";

export type UploadedPhoto = PhotoAttachInput & {
  status: "uploading" | "uploaded" | "attached" | "queued" | "error";
  previewUrl: string;
  /** Original file name (shown for PDFs, which have no thumbnail). */
  name?: string;
  error?: string;
};

const isPdfFile = (f: File) => isPdfMime(f.type) || /\.pdf$/i.test(f.name);

/** Upload one already-resized blob straight to Storage via a signed URL. */
export async function uploadPhotoBlob(input: {
  refTable: DocumentRefTable;
  refId: string;
  documentId: string;
  blob: Blob;
  mime: string;
}): Promise<{ path?: string; error?: string }> {
  const ticket = await createPhotoUploadTicket({
    refTable: input.refTable,
    refId: input.refId,
    documentId: input.documentId,
    mime: input.mime,
    sizeBytes: input.blob.size,
  });
  if (ticket.error || !ticket.path || !ticket.token)
    return { error: ticket.error ?? "Yükleme bileti alınamadı." };
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .uploadToSignedUrl(ticket.path, ticket.token, input.blob, {
      contentType: input.mime,
      upsert: true,
    });
  if (error) return { error: error.message };
  return { path: ticket.path };
}

/**
 * Camera / gallery picker that resizes, uploads and (optionally) attaches
 * photos to a record.
 *
 * - `autoAttach` (record already exists): each photo is registered right after
 *   upload and the page is refreshed by the caller via `onAttached`.
 * - deferred (form not saved yet): photos are uploaded under the future record
 *   id; the form calls `attachPhotos` after its own save with `value`.
 * - `onOffline`: when provided and the device is offline, the resized blob is
 *   handed over (offline queue) instead of failing.
 */
export function PhotoUploader({
  refTable,
  refId,
  value,
  onChange,
  autoAttach = false,
  onAttached,
  onOffline,
  max = 6,
  compact = false,
  allowPdf = false,
}: {
  refTable: DocumentRefTable;
  refId: string;
  value: UploadedPhoto[];
  onChange: (next: UploadedPhoto[]) => void;
  autoAttach?: boolean;
  onAttached?: () => void;
  onOffline?: (p: {
    documentId: string;
    blob: Blob;
    mime: string;
  }) => Promise<void>;
  max?: number;
  compact?: boolean;
  /** Also accept PDF files from the gallery / file picker (price lists). */
  allowPdf?: boolean;
}) {
  const { toast } = useToast();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  function patch(id: string, fields: Partial<UploadedPhoto>) {
    const next = valueRef.current.map((p) =>
      p.documentId === id ? { ...p, ...fields } : p
    );
    valueRef.current = next;
    onChange(next);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = max - valueRef.current.length;
    if (room <= 0) {
      toast(`En fazla ${max} ${allowPdf ? "dosya" : "fotoğraf"} eklenebilir`, "warn");
      return;
    }
    setBusy(true);
    const list = Array.from(files).slice(0, room);
    for (const file of list) {
      const documentId = newId();
      let blob: Blob;
      let mime: string;
      const pdf = isPdfFile(file);
      if (pdf) {
        if (!allowPdf) {
          toast("Bu alana yalnızca fotoğraf eklenebilir", "warn");
          continue;
        }
        if (file.size > PDF_MAX_BYTES) {
          toast(`PDF ${Math.round(PDF_MAX_BYTES / 1024 / 1024)} MB sınırını aşıyor`, "warn");
          continue;
        }
        blob = file;
        mime = PDF_MIME;
      } else {
        try {
          ({ blob, mime } = await resizePhoto(file, PHOTO_MAX_BYTES));
        } catch (e) {
          toast(e instanceof Error ? e.message : "Fotoğraf okunamadı", "warn");
          continue;
        }
      }
      const previewUrl = pdf ? "" : URL.createObjectURL(blob);
      const path = photoPath(refTable, refId, documentId, mime);
      const entry: UploadedPhoto = {
        documentId,
        path,
        mime,
        sizeBytes: blob.size,
        status: "uploading",
        previewUrl,
        name: pdf ? file.name : undefined,
      };
      const next = [...valueRef.current, entry];
      valueRef.current = next;
      onChange(next);

      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (offline && onOffline) {
        try {
          await onOffline({ documentId, blob, mime });
          patch(documentId, { status: "queued" });
        } catch {
          patch(documentId, { status: "error", error: "Çevrimdışı kuyruğa alınamadı" });
        }
        continue;
      }

      try {
        const up = await uploadPhotoBlob({ refTable, refId, documentId, blob, mime });
        if (up.error) {
          if (onOffline && /fetch|network|load failed/i.test(up.error)) {
            await onOffline({ documentId, blob, mime });
            patch(documentId, { status: "queued" });
          } else {
            patch(documentId, { status: "error", error: up.error });
          }
          continue;
        }
        if (autoAttach) {
          const att = await attachPhotos({
            refTable,
            refId,
            photos: [{ documentId, path, mime, sizeBytes: blob.size }],
          });
          if (att.error) {
            patch(documentId, { status: "error", error: att.error });
            continue;
          }
          patch(documentId, { status: "attached" });
          onAttached?.();
        } else {
          patch(documentId, { status: "uploaded" });
        }
      } catch {
        if (onOffline) {
          await onOffline({ documentId, blob, mime }).catch(() => undefined);
          patch(documentId, { status: "queued" });
        } else {
          patch(documentId, {
            status: "error",
            error: "Yüklenemedi — bağlantınızı kontrol edin",
          });
        }
      }
    }
    setBusy(false);
    if (camRef.current) camRef.current.value = "";
    if (galRef.current) galRef.current.value = "";
  }

  function remove(id: string) {
    const next = valueRef.current.filter((p) => p.documentId !== id);
    valueRef.current = next;
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={galRef}
        type="file"
        accept={allowPdf ? "image/*,application/pdf" : "image/*"}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className="flex-1"
          disabled={busy || value.length >= max}
          onClick={() => camRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Camera className="mr-2 h-4 w-4" />
          )}
          Fotoğraf çek
        </Button>
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className="flex-1"
          disabled={busy || value.length >= max}
          onClick={() => galRef.current?.click()}
        >
          <ImagePlus className="mr-2 h-4 w-4" /> {allowPdf ? "Galeri / PDF" : "Galeriden seç"}
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((p) => (
            <div key={p.documentId} className="relative h-20 w-20 shrink-0">
              {isPdfMime(p.mime) ? (
                <div
                  className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border bg-muted p-1 text-center ${
                    p.status === "uploading" ? "opacity-50" : ""
                  }`}
                  title={p.name}
                >
                  <FileText className="h-6 w-6 text-muted-foreground" />
                  <span className="line-clamp-2 w-full break-all text-[10px] leading-tight text-muted-foreground">
                    {p.name ?? "PDF"}
                  </span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.previewUrl}
                  alt=""
                  className={`h-20 w-20 rounded-md border object-cover ${
                    p.status === "uploading" ? "opacity-50" : ""
                  }`}
                />
              )}
              {p.status === "uploading" && (
                <Loader2 className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 animate-spin text-primary" />
              )}
              {p.status === "queued" && (
                <span
                  className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white"
                  title="Bağlantı gelince yüklenecek"
                >
                  <CloudOff className="mr-0.5 inline h-3 w-3" />
                  Çevrimdışı
                </span>
              )}
              {p.status === "error" && (
                <span
                  className="absolute bottom-1 left-1 rounded bg-destructive px-1 text-[10px] text-white"
                  title={p.error}
                >
                  <AlertTriangle className="mr-0.5 inline h-3 w-3" />
                  Hata
                </span>
              )}
              {p.status !== "attached" && p.status !== "uploading" && (
                <button
                  type="button"
                  onClick={() => remove(p.documentId)}
                  className="absolute -right-1.5 -top-1.5 rounded-full border bg-card p-0.5 text-muted-foreground hover:text-destructive"
                  title="Kaldır"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {value.some((p) => p.status === "error") && (
        <p className="text-xs text-destructive">
          {value.find((p) => p.status === "error")?.error}
        </p>
      )}
    </div>
  );
}
