import type { NextConfig } from "next";

/**
 * NEXT_PUBLIC_STATIC_DEMO=1 builds the static hosted demo (GitHub Pages):
 * a static export with no server. API route handlers are .ts files, so
 * limiting page extensions to .tsx leaves them out of that build; the
 * browser answers API calls itself (src/lib/client/local-backend.ts).
 */
const staticDemo = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  ...(staticDemo
    ? {
        output: "export",
        distDir: "out", // export lands here; keeps the dev server's .next untouched
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
        pageExtensions: ["tsx"],
      }
    : {}),
};

export default nextConfig;
