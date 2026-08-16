import { prisma } from "../lib/db.ts";
import { backfillRecentTactics } from "../lib/data/tacticsBackfill.ts";

const requested = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 200);
const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 2000) : 200;

async function main() {
  console.log(JSON.stringify({ ok: true, ...await backfillRecentTactics(limit) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
