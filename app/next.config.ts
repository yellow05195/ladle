import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const nextConfig: NextConfig = {
  // The sdk is a workspace package shipped as TypeScript source; compile it with the app.
  transpilePackages: ["@pulled/sdk"],
  // The app imports research JSON and the sdk from the monorepo root.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async headers() {
    return [
      {
        // The embed route is meant to live inside third-party iframes.
        // No X-Frame-Options anywhere; frame-ancestors * only here.
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
