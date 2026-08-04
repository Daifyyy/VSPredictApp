import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace root je tento projekt (vedle něj je další lockfile v C:\Projekt).
  turbopack: { root: import.meta.dirname },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.api-sports.io",
        pathname: "/football/venues/**",
      },
    ],
  },
};

export default nextConfig;
