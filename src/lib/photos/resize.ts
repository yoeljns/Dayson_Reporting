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
    const mime = await sniffMime(file);
    if (!mime)
      throw new Error("Bu fotoğraf formatı desteklenmiyor — JPEG olarak kaydedin.");
    return { blob: file, mime };
  }
}

/** Magic-byte check: pickers sometimes report an empty or wrong type. */
async function sniffMime(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    return "image/png";
  const ascii = (a: number, b: number) => String.fromCharCode(...head.slice(a, b));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
