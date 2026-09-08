"use client";

import { useState } from "react";
import { X, Trash2, Camera, FileText } from "lucide-react";
import { isPdfMime } from "@/lib/enums";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { useToast } from "@/components/ui/toast";
import { removePhoto } from "@/app/(app)/foto/actions";
import type { PhotoView } from "@/lib/photos/server";

/**
 * Read-only photo thumbnails with a full-screen viewer. `canDelete` shows a
 * trash icon per photo (server re-checks ownership / manager role).
 */
export function PhotoGrid({
  photos,
  canDelete = false,
  emptyText,
  size = "md",
}: {
  photos: PhotoView[];
  canDelete?: boolean;
  emptyText?: string | null;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState<PhotoView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (photos.length === 0) {
    return emptyText ? (
      <p className="text-sm text-muted-foreground">{emptyText}</p>
    ) : null;
  }

  const isPdf = (p: PhotoView) => isPdfMime(p.mime);

  async function del(p: PhotoView) {
    setBusy(p.id);
    const res = await removePhoto({ documentId: p.id });
    setBusy(null);
    if (res.error) {
      toast(res.error, "warn");
      return;
    }
    toast(isPdf(p) ? "Dosya silindi" : "Fotoğraf silindi", "ok");
    setOpen(null);
    router.refresh();
  }

  const cell = size === "sm" ? "h-16 w-16" : "h-24 w-24";

  return (
    <>
      <div className="flex flex-wrap gap-2 print:gap-1">
        {photos.map((p) => (
          <div key={p.id} className={`relative ${cell} shrink-0`}>
            {isPdf(p) ? (
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex ${cell} flex-col items-center justify-center gap-1 rounded-md border bg-muted text-muted-foreground hover:text-foreground`}
                title="PDF'i aç"
              >
                <FileText className={size === "sm" ? "h-5 w-5" : "h-7 w-7"} />
                <span className="text-[10px] font-medium">PDF</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(p)}
                className={`${cell} overflow-hidden rounded-md border bg-muted`}
                title="Büyüt"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt="Fotoğraf"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            )}
            {canDelete && (
              <ConfirmButton
                variant="destructive"
                size="icon"
                className="absolute -right-1.5 -top-1.5 h-6 w-6 rounded-full print:hidden"
                title={isPdf(p) ? "Dosyayı sil" : "Fotoğrafı sil"}
                message={isPdf(p) ? "Bu dosya silinsin mi?" : "Bu fotoğraf silinsin mi?"}
                confirmText="Sil"
                disabled={busy === p.id}
                onConfirm={() => del(p)}
              >
                <Trash2 className="h-3 w-3" />
              </ConfirmButton>
            )}
          </div>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90 print:hidden"
          onClick={() => setOpen(null)}
        >
          <div className="flex items-center justify-between p-3 text-white">
            <span className="flex items-center gap-2 text-sm">
              <Camera className="h-4 w-4" />
              {new Date(open.uploadedAt).toLocaleString("tr-TR")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={() => setOpen(null)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={open.url}
            alt="Fotoğraf"
            className="min-h-0 flex-1 object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
