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
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://media.api-sports.io; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https://js.stripe.com https://*.stripe.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
