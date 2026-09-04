import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(".");
const output = resolve(process.env.AUDIT_OUTPUT ?? "docs/audit/evidence/static-inventory.json");
const excluded = [/^app[\\/]api[\\/](game|director)([\\/]|$)/, /^app[\\/]hra([\\/]|$)/];

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path));
    else result.push(path);
  }
  return result;
}

const normalized = (path) => relative(root, path).split(sep).join("/");
const inScope = (path) => !excluded.some((pattern) => pattern.test(relative(root, path)));
const routeFiles = (await filesUnder(join(root, "app", "api")))
  .filter((path) => path.endsWith("route.ts") && inScope(path));

const routes = [];
for (const path of routeFiles) {
  const source = await readFile(path, "utf8");
  routes.push({
    file: normalized(path),
    methods: [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]),
    auth: /getCurrentUser|\bauth\(\)|requireAdmin|requirePro|isAdmin/.test(source),
    cronAuth: /requireCronAuth/.test(source),
    rateLimit: /allowRequest\(/.test(source),
    publicCache: /publicCache\(|s-maxage|force-static|revalidate\s*=/.test(source),
    privateNoStore: /private,\s*no-store|cache:\s*["']no-store/.test(source),
    prisma: /\bprisma\./.test(source),
    upstream: /api-football|api-sports|fetchFromApi|fetchApiFootball/.test(source),
  });
}

const appFiles = (await filesUnder(join(root, "app"))).filter((path) => /\.(ts|tsx)$/.test(path) && inScope(path));
const clientFetches = [];
for (const path of appFiles) {
  const source = await readFile(path, "utf8");
  if (!source.startsWith('"use client"') && !source.startsWith("'use client'")) continue;
  const fetches = [...source.matchAll(/fetch\(\s*([`"'])(.*?)\1/g)].map((m) => m[2]);
  if (fetches.length) clientFetches.push({ file: normalized(path), count: fetches.length, endpoints: fetches });
}

const findings = [];
for (const route of routes) {
  if (route.methods.includes("GET") && route.auth && !route.privateNoStore) {
    findings.push({ severity: "P1", code: "AUTH_GET_WITHOUT_EXPLICIT_NO_STORE", file: route.file });
  }
  if (route.upstream && !route.cronAuth && !route.rateLimit) {
    findings.push({ severity: "P1", code: "UPSTREAM_WITHOUT_ROUTE_GUARD", file: route.file });
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  scopeExclusions: ["/hra", "/api/game", "/api/director"],
  totals: {
    apiRoutes: routes.length,
    apiMethods: routes.reduce((sum, route) => sum + route.methods.length, 0),
    authenticatedRoutes: routes.filter((route) => route.auth).length,
    cronRoutes: routes.filter((route) => route.cronAuth).length,
    rateLimitedRoutes: routes.filter((route) => route.rateLimit).length,
    explicitPublicCacheRoutes: routes.filter((route) => route.publicCache).length,
    explicitPrivateNoStoreRoutes: routes.filter((route) => route.privateNoStore).length,
    clientFetchCalls: clientFetches.reduce((sum, item) => sum + item.count, 0),
  },
  routes,
  clientFetches,
  heuristicFindings: findings,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload.totals, null, 2));
console.log(`Heuristic findings: ${findings.length}`);
