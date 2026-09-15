// GITHUB_PAGES=true: static export for the /starnetbroser GH Pages subpath.
// STATIC_EXPORT=true: static export with no basePath - used by apps/android
// (Capacitor bundles static files into the WebView, served from its own
// local root, not a subpath).
const staticExport = process.env.GITHUB_PAGES === "true" || process.env.STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@starnet/shared"],
  ...(staticExport
    ? {
        output: "export",
        basePath,
        images: { unoptimized: true },
      }
    : {}),
};

module.exports = nextConfig;
