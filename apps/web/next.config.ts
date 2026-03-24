import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@rematch/shared-types",
    "@rematch/rules-engine",
    "@rematch/import-adapters",
    "@rematch/discord-sync"
  ]
};

export default nextConfig;
