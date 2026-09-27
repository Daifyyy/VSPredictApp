import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { evaluatePressurePerformance } from "../picks/pressurePerformance";

export const PRESSURE_PERFORMANCE_CACHE_KEY = "pressure-performance:v5:report:1";

/** Existing stored forecasts only. Run after settlement, never during page rendering. */
export async function refreshPressurePerformance(now = new Date()) {
  const rows = await prisma.fixturePrediction.findMany({
    where: { inputSnapshot: { path: ["performancePressure", "version"], equals: 5 } },
    select: { fixtureId: true, kickoff: true, status: true, homeGoals: true, awayGoals: true, inputSnapshot: true },
  });
  const report = { ...evaluatePressurePerformance(rows), asOf: now.toISOString(), collectionEnabled: process.env.PRESSURE_V5_ENABLED !== "false", opportunitiesEnabled: process.env.PRESSURE_V5_OPPORTUNITIES_ENABLED === "true" };
  const payload = JSON.parse(JSON.stringify(report)) as Prisma.InputJsonValue;
  const expiresAt = new Date(now.getTime() + 36 * 3600_000);
  await prisma.apiCache.upsert({ where: { key: PRESSURE_PERFORMANCE_CACHE_KEY }, create: { key: PRESSURE_PERFORMANCE_CACHE_KEY, payload, expiresAt }, update: { payload, expiresAt } });
  return report;
}
