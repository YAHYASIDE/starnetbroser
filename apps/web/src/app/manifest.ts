import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Prefixed manually because a MetadataRoute.Manifest's string fields (unlike
// next/link or the `manifest` metadata field) are not auto-prefixed with
// Next's basePath - needed for the /starnetbroser subpath GitHub Pages build.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "STAR NET",
    short_name: "STAR NET",
    description: "إدارة حسابات وأجهزة Starlink",
    start_url: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#0f6e6e",
    icons: [
      { src: `${BASE_PATH}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
