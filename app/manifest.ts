import type { MetadataRoute } from "next";

// PWA manifest (Next metadata route). Ikony generuje scripts/generateBrandIcons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Football Insight — fotbalové zápasy a analýzy",
    short_name: "Football Insight",
    description:
      "Předzápasové predikce, modelové tipy a výsledky fotbalových zápasů.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1017",
    theme_color: "#0b1017",
    lang: "cs",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
