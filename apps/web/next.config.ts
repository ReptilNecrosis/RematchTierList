import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@rematch/shared-types",
    "@rematch/rules-engine",
    "@rematch/import-adapters",
    "@rematch/discord-sync"
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dtmwra1jsgyb0.cloudfront.net",
        pathname: "/**"
      },
      {
        protocol: "https",
        hostname: "**.battlefy.com",
        pathname: "/**"
      },
      {
        protocol: "https",
        hostname: "s3.amazonaws.com",
        pathname: "/**"
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**"
      }
    ]
  }
};

export default nextConfig;
