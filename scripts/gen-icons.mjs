// Generates the PWA launcher icons from public/logo.png onto the brand
// background. The PNGs are committed to the repo — rerun after a logo change:
//   npm run gen:icons
//
// Android install ("Uygulamayı yükle" / WebAPK) requires valid 192px and 512px
// icons; the maskable variant keeps the logo inside the safe zone so Android's
// circle/squircle crop never cuts it.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "public", "logo.png");
const OUT = path.join(root, "public", "icons");
// White, not the cream manifest background_color: the emblem's own backing is
// white, so a white canvas makes it blend seamlessly.
const BG = "#FFFFFF";

// The full logo is a ~5:1 wordmark (DAYSON · AVRUPA GROUP · SIA) — illegible as
// a launcher icon. Use only the DAYSON emblem: crop the left segment inside the
// black frame (stopping before AVRUPA's first letter), then trim() tightens to
// the artwork. Adjust CROP if the logo layout ever changes.
const CROP = { left: 10, top: 10, width: 114, height: 90 };

async function markBuffer() {
  return sharp(SRC)
    .extract(CROP)
    .trim({ threshold: 50 })
    .png()
    .toBuffer();
}

/** Render the mark centered on a square canvas.
 *  @param size   canvas edge in px
 *  @param scale  mark width as a fraction of the canvas (maskable needs ≤0.6) */
async function makeIcon(size, scale, file) {
  const logo = await sharp(await markBuffer())
    .resize({
      width: Math.round(size * scale),
      height: Math.round(size * scale),
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT, file));
  console.log(`gen-icons: ${file} (${size}x${size})`);
}

await mkdir(OUT, { recursive: true });
await makeIcon(192, 0.78, "icon-192.png");
await makeIcon(512, 0.78, "icon-512.png");
await makeIcon(512, 0.6, "icon-512-maskable.png");
await makeIcon(180, 0.78, "apple-touch-icon.png");
console.log("gen-icons: done.");
