import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { evaluatePressurePerformance, type PressurePerformanceRow } from "../picks/pressurePerformance";

export const PRESSURE_PERFORMANCE_CACHE_KEY = "pressure-performance:v5:report:1";

/** Existing stored forecasts only. Run after settlement, never during page rendering. */
export async function refreshPressurePerformance(now = new Date()) {
  if (process.env.PRESSURE_PERFORMANCE_INCREMENTAL_ENABLED === 'true') {
    const { refreshIncrementalPressurePerformance } = await import('./pressurePerformanceIncrementalStore');
    return refreshIncrementalPressurePerformance(now, PRESSURE_PERFORMANCE_CACHE_KEY);
  }
  // Select only the frozen fields consumed by scoring; never transfer odds/features JSON.
  const rows = await prisma.$queryRaw<PressurePerformanceRow[]>`
    SELECT "fixtureId", "kickoff", "status", "homeGoals", "awayGoals",
      jsonb_build_object('performancePressure', jsonb_build_object(
        'version', "inputSnapshot" #> '{performancePressure,version}',
        'capturedAt', "inputSnapshot" #> '{performancePressure,capturedAt}',
        'context', "inputSnapshot" #> '{performancePressure,context}',
        'artifactVersion', "inputSnapshot" #> '{performancePressure,artifactVersion}',
        'marketProbabilities', "inputSnapshot" #> '{performancePressure,marketProbabilities}',
        'mainMarketProbabilities', "inputSnapshot" #> '{performancePressure,mainMarketProbabilities}',
        'currentOver25', "inputSnapshot" #> '{performancePressure,currentOver25}'
      )) AS "inputSnapshot"
    FROM "FixturePrediction"
    WHERE "inputSnapshot" #> '{performancePressure,version}' = '5'::jsonb
  `;
  const report = { ...evaluatePressurePerformance(rows), asOf: now.toISOString(), collectionEnabled: process.env.PRESSURE_V5_ENABLED !== "false", opportunitiesEnabled: process.env.PRESSURE_V5_OPPORTUNITIES_ENABLED === "true" };
  const payload = JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue;
  const expiresAt = new Date(now.getTime() + 36 * 3600_000);
  await prisma.apiCache.upsert({ where: { key: PRESSURE_PERFORMANCE_CACHE_KEY }, create: { key: PRESSURE_PERFORMANCE_CACHE_KEY, payload, expiresAt }, update: { payload, expiresAt } });
  return report;
}
