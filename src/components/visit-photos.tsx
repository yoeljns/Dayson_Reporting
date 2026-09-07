"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { PhotoUploader, type UploadedPhoto } from "@/components/photo-uploader";
import { PhotoGrid } from "@/components/photo-grid";
import type { PhotoView } from "@/lib/photos/server";
import type { DocumentRefTable } from "@/lib/enums";
import { queuePhotoBlob, queuePhotos } from "@/lib/offline";

/**
 * Photos section of an existing record: current photos (deletable by the
 * owner / manager) + uploader that attaches immediately.
 */
export function RecordPhotos({
  refTable,
  refId,
  photos,
  canEdit,
  title = "Fotoğraflar",
}: {
  refTable: DocumentRefTable;
  refId: string;
  photos: PhotoView[];
  canEdit: boolean;
  title?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<UploadedPhoto[]>([]);

  if (!canEdit && photos.length === 0) return null;

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Camera className="h-4 w-4 text-muted-foreground" />
          {title}
          {photos.length > 0 && (
            <span className="text-xs text-muted-foreground">({photos.length})</span>
          )}
        </div>
      )}
      <PhotoGrid
        photos={photos}
        canDelete={canEdit}
        emptyText={canEdit ? null : undefined}
      />
      {canEdit && (
        <PhotoUploader
          refTable={refTable}
          refId={refId}
          value={pending}
          onChange={setPending}
          autoAttach
          compact
          onAttached={() => {
            // Drop attached entries once the server list catches up.
            setPending((prev) => prev.filter((p) => p.status !== "attached"));
            router.refresh();
          }}
          onOffline={async (p) => {
            await queuePhotoBlob({ ...p, refTable, refId });
            // The record already exists → a photos op can be queued right away.
            await queuePhotos(title ?? "Fotoğraf", refTable, refId, [
              {
                documentId: p.documentId,
                path: "",
                mime: p.mime,
                sizeBytes: p.blob.size,
                status: "queued",
                previewUrl: "",
              },
            ]);
          }}
        />
      )}
    </div>
  );
}
