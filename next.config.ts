import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // WASM decoder with dynamic internal imports (WhatsApp voice notes):
  // keep it out of the Turbopack bundle, load from node_modules at runtime.
  serverExternalPackages: ["ogg-opus-decoder"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
