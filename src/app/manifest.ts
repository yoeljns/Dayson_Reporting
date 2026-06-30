import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dayson Raporlama",
    short_name: "Dayson",
    description: "Pazarlama saha raporlama sistemi",
    start_url: "/",
    display: "standalone",
    background_color: "#EFE9E0",
    theme_color: "#EFE9E0",
    lang: "tr",
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
        purpose: "maskable",
      },
    ],
  };
}
