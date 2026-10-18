/** Offline by default. --refresh explicitly makes a bounded, read-only DB export. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { auditStrategyEvidence, type EvidenceRow, type EvidenceFixture } from "../lib/picks/strategyEvidenceAudit";

const directory = ".runtime/strategy-evidence-v1";
type Export = { asOf: string; rows: EvidenceRow[]; fixtures: EvidenceFixture[]; schemaVersion: number };
async function main() {
  if (process.argv.includes("--help")) {
    console.log("Offline: node --import tsx scripts/auditStrategyEvidence.ts\nExplicit read-only DB export: add --refresh and load your local environment files.");
    return;
  }
  await mkdir(directory, { recursive: true });
  let data: Export;
  if (process.argv.includes("--refresh")) {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    try {
      data = await db.$transaction(async tx => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
        const [clock] = await tx.$queryRaw<Array<{ asOf: Date }>>`SELECT CURRENT_TIMESTAMP AS "asOf"`;
        const rows = await tx.autonomousTipSnapshot.findMany({ where: { status: "candidate" }, take: 10001, orderBy: { id: "asc" }, select: {
          id: true, fixtureId: true, leagueId: true, homeTeamId: true, awayTeamId: true,
          strategy: true, policyVersion: true, modelVersion: true, contextVersion: true, countModelVersion: true, modelContext: true,
          market: true, side: true, line: true, kickoff: true, qualifiedAt: true, settledAt: true,
          decimalOdds: true, bookmaker: true, stake: true, modelProbability: true, marketProbability: true,
          settlementStatus: true, hit: true, profit: true, actualCount: true,
          clvMethodVersion: true, closedAt: true, closingBenchmarkProbability: true, closingBenchmarkQuality: true,
          sameBookClv: true, openingBookmaker: true,
        } });
        if (rows.length >= 10001) throw Error("EXPORT_CAP_REACHED");
        const fixtures = rows.length ? await tx.fixturePrediction.findMany({ where: { fixtureId: { in: [...new Set(rows.map(r => r.fixtureId))] } }, select: {
          fixtureId: true, homeTeamId: true, awayTeamId: true, status: true, homeGoals: true, awayGoals: true,
        } }) : [];
        return JSON.parse(JSON.stringify({ asOf: clock.asOf, rows, fixtures, schemaVersion: 1 })) as Export;
      }, { isolationLevel: "RepeatableRead", timeout: 25000, maxWait: 5000 });
      const raw = JSON.stringify(data);
      if (Buffer.byteLength(raw) > 8_000_000) throw Error("EXPORT_SIZE_LIMIT");
      // Timestamped source: an older evidence file is never silently replaced.
      const name = `${data.asOf.replace(/[:.]/g, "-")}.json`;
      await writeFile(`${directory}/${name}`, raw, { flag: "wx" });
      await writeFile(`${directory}/latest.json`, JSON.stringify({ name }));
    } finally { await db.$disconnect(); }
  } else {
    const pointer = JSON.parse(await readFile(`${directory}/latest.json`, "utf8")) as { name: string };
    if (!/^[\w-]+\.json$/.test(pointer.name)) throw Error("INVALID_LOCAL_EXPORT_PATH");
    data = JSON.parse(await readFile(`${directory}/${pointer.name}`, "utf8"));
  }
  if (data.schemaVersion !== 1) throw Error("UNSUPPORTED_EXPORT");
  const report = { ...auditStrategyEvidence(data.rows, data.fixtures, data.asOf), datasetHash: createHash("sha256").update(JSON.stringify(data)).digest("hex") };
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ asOf: report.asOf, hash: report.datasetHash, sourceBytes: Buffer.byteLength(JSON.stringify(data)), rows: report.rows,
    issues: report.issues, cohorts: report.cohorts.map(r => ({ ...r, daily: undefined })) }, null, 2));
}
main().catch(error => { console.error("EVIDENCE_AUDIT_FAILED", String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]")); process.exitCode = 1; });
