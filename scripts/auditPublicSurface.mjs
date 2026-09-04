import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_PATHS = [
  "/", "/porovnani", "/predikce", "/tabulky", "/transfers", "/tipovacka",
  "/api/leagues", "/api/teams?league=39", "/api/me",
  "/manifest.webmanifest", "/robots.txt", "/sitemap.xml",
];

const baseUrl = (process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const output = resolve(process.env.AUDIT_OUTPUT ?? "docs/audit/evidence/public-surface.json");
const timeoutMs = Number(process.env.AUDIT_TIMEOUT_MS ?? 15_000);

async function probe(path) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Football-Insight-Read-Only-Audit/1.0" },
    });
    const body = await response.arrayBuffer();
    return {
      path, status: response.status,
      durationMs: Math.round(performance.now() - started), bytes: body.byteLength,
      cacheControl: response.headers.get("cache-control"),
      contentType: response.headers.get("content-type"),
      requestId: response.headers.get("x-vercel-id") ?? response.headers.get("x-request-id"),
      security: {
        contentTypeOptions: response.headers.get("x-content-type-options"),
        frameOptions: response.headers.get("x-frame-options"),
        referrerPolicy: response.headers.get("referrer-policy"),
        permissionsPolicy: response.headers.get("permissions-policy"),
        contentSecurityPolicy: response.headers.get("content-security-policy"),
      },
    };
  } catch (error) {
    return {
      path, status: null, durationMs: Math.round(performance.now() - started), bytes: 0,
      cacheControl: null, contentType: null, requestId: null, security: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const paths = process.argv.slice(2).filter((value) => value.startsWith("/"));
  const probes = await Promise.all((paths.length ? paths : DEFAULT_PATHS).map(probe));
  const payload = {
    generatedAt: new Date().toISOString(), baseUrl, mode: "read-only",
    scopeExclusions: ["/hra", "/api/game", "/api/director"], probes,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
