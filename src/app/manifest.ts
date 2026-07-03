import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Avrupa Ziyaret",
    short_name: "Avrupa Ziyaret",
    description: "Pazarlama saha raporlama sistemi",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EFE9E0",
    theme_color: "#EFE9E0",
    lang: "tr",
    // Android install (WebAPK) needs valid 192 + 512 "any" icons; the separate
    // maskable file keeps the logo inside the safe zone for circle crops.
    // Files are generated from public/logo.png via `npm run gen:icons`.
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
