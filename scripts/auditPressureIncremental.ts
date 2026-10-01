/** Explicit local read-only validation; no state/contributions are persisted. */
import { Prisma, PrismaClient } from '@prisma/client';
import { incrementalPressureChangesQuery } from '../lib/data/pressurePerformanceIncrementalStore';
import { evaluatePressurePerformance, type PressurePerformanceRow } from '../lib/picks/pressurePerformance';
import { emptyPressureAccumulator, pressureAccumulatorReport, pressureContribution, replacePressureContribution } from '../lib/picks/pressurePerformanceIncremental';
const db = new PrismaClient();
async function main() {
  const result = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '8000ms'`;
    const query = incrementalPressureChangesQuery('pressure-readonly-audit-no-existing-state:');
    const plan = await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
    const rows = await tx.$queryRaw<PressurePerformanceRow[]>(query);
    const accumulator = emptyPressureAccumulator();
    const contributions = rows.map(pressureContribution);
    contributions.forEach(value => replacePressureContribution(accumulator, undefined, value));
    // Repeat unchanged sources and compare the same unique sample again.
    contributions.forEach(value => replacePressureContribution(accumulator, value, value));
    const full = evaluatePressurePerformance(rows), incremental = pressureAccumulatorReport(accumulator);
    const differences: number[] = [];
    for (const cohort of full.cohorts) {
      const other = incremental.cohorts.find(c => c.context === cohort.context && c.artifactVersion === cohort.artifactVersion);
      if (!other || other.captured !== cohort.captured || other.settled !== cohort.settled) throw new Error('COUNT_MISMATCH');
      for (const [market, metrics] of Object.entries(cohort.markets)) {
        const actual = other.markets[market];
        for (const kind of ['candidate', 'pairedCandidate', 'baseline'] as const) {
          if (actual[kind].n !== metrics[kind].n) throw new Error('DENOMINATOR_MISMATCH');
          for (const metric of ['brier', 'logLoss'] as const) {
            if ((actual[kind][metric] == null) !== (metrics[kind][metric] == null)) throw new Error('NULL_MISMATCH');
            differences.push(Math.abs((actual[kind][metric] ?? 0) - (metrics[kind][metric] ?? 0)));
          }
        }
      }
    }
    const maxDifference = Math.max(0, ...differences);
    if (maxDifference > 1e-10 || incremental.rejected !== full.rejected) throw new Error('METRIC_MISMATCH');
    return { sample: rows.length, contributionJsonBytes: Buffer.byteLength(JSON.stringify(contributions)), maxDifference, plan };
  }, { timeout: 20_000 });
  console.log(JSON.stringify({ asOf: new Date().toISOString(), source: 'READ_ONLY_SAMPLE_NOT_MONTHLY_BILLING', ...result }, null, 2));
}
main().catch(() => { console.error('INCREMENTAL_AUDIT_FAILED: query or equivalence check failed; no database writes.'); process.exitCode = 1; }).finally(() => db.$disconnect());
