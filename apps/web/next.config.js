const isGithubPages = process.env.GITHUB_PAGES === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@starnet/shared"],
  ...(isGithubPages
    ? {
        output: "export",
        basePath,
        images: { unoptimized: true },
      }
    : {}),
};

module.exports = nextConfig;
