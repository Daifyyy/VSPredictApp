import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace root je tento projekt (vedle něj je další lockfile v C:\Projekt).
  turbopack: { root: import.meta.dirname },
  // Prisma Client běží v Node.js přes nativní query engine. Balíček ale exportuje
  // také Edge/WASM enginy pro všechny databáze a NFT je kvůli dynamickým importům
  // trasuje do každé funkce. Ponecháváme library runtime, schéma a nativní engine.
  outputFileTracingExcludes: {
    "/*": [
      "node_modules/@prisma/client/runtime/query_compiler_bg.*",
      "node_modules/@prisma/client/runtime/query_engine_bg.*",
      "node_modules/@prisma/client/runtime/wasm-*.js",
      "node_modules/@prisma/client/runtime/wasm-*.mjs",
      "node_modules/.prisma/client/query_engine_bg.*",
      "node_modules/.prisma/client/query_engine-*.tmp*",
      "node_modules/.prisma/client/edge.*",
      "node_modules/.prisma/client/wasm.*",
      "node_modules/.prisma/client/wasm-*-loader.mjs",
    ],
  },
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
