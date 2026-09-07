/**
 * Client-side photo downscale: long edge ≤ 1600px, JPEG q0.82, orientation
 * baked in from EXIF. Falls back to the original file (≤ max bytes) when the
 * browser cannot decode it. Runs only in the browser.
 */
export const PHOTO_LONG_EDGE = 1600;

export async function resizePhoto(
  file: File | Blob,
  maxBytes: number
): Promise<{ blob: Blob; mime: string }> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    } as ImageBitmapOptions);
    const scale = Math.min(
      1,
      PHOTO_LONG_EDGE / Math.max(bitmap.width, bitmap.height)
    );
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob) throw new Error("toBlob failed");
    return { blob, mime: "image/jpeg" };
  } catch {
    if (file.size > maxBytes)
      throw new Error("Fotoğraf çok büyük ve küçültülemedi.");
    const mime = (file as File).type || "image/jpeg";
    return { blob: file, mime };
  }
}
