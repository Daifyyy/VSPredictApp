import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { sharedReadCache } from "../boundedCache";
import { pragueDateBounds } from "../recentWindow";

export type OneXTwoDailyForecast = {
  fixtureId: number; homeName: string; awayName: string; kickoff: string;
  modelVersion: number; capturedAt: string; probabilities: [number, number, number];
  market: [number, number, number] | null; quality: string;
};
type Row = {
  fixtureId: number; homeName: string; awayName: string; kickoff: Date; modelVersion: number;
  model: unknown; market: unknown; quality: string; capturedAt: string; predictedAt: string;
  auditKickoff: string; auditModelVersion: string;
};
const vector = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3
  && v.every(x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1)
  && Math.abs(v.reduce((s, x) => s + x, 0) - 1) <= 1e-6;

/** No training, source JSON, odds series or historical aggregate on a page read. */
export function oneXTwoDailyQuery(start: Date, end: Date) {
  return Prisma.sql`
    SELECT * FROM (
      SELECT DISTINCT ON (s."fixtureId") s."fixtureId", p."homeName", p."awayName", s."kickoff", s."modelVersion",
        s."openingForecastAudit"->'model' AS model,
        s."openingForecastAudit"->'market' AS market,
        s."openingForecastAudit"->>'quality' AS quality,
        s."openingForecastAudit"->>'capturedAt' AS "capturedAt",
        s."openingForecastAudit"->>'predictedAt' AS "predictedAt",
        s."openingForecastAudit"->>'kickoff' AS "auditKickoff",
        s."openingForecastAudit"->>'modelVersion' AS "auditModelVersion"
      FROM "MarketSignalSnapshot" s
      JOIN "FixturePrediction" p ON p."fixtureId" = s."fixtureId" AND p."kickoff" = s."kickoff"
        AND p."homeTeamId"::text = s."openingForecastAudit"->>'homeTeamId'
        AND p."awayTeamId"::text = s."openingForecastAudit"->>'awayTeamId'
      WHERE s.market = '1X2' AND s."modelContext" = 'LEAGUE'
        AND s."kickoff" >= ${start} AND s."kickoff" < ${end}
        AND s."openingForecastAudit"->>'version' = '1'
        AND s."openingForecastAudit"->>'fixtureId' = s."fixtureId"::text
      ORDER BY s."fixtureId", s."openedAt", s.id
    ) daily ORDER BY "kickoff", "fixtureId" LIMIT 201`;
}

export function normalizeOneXTwoDaily(rows: Row[]): OneXTwoDailyForecast[] {
  return rows.flatMap(row => {
    const captured = Date.parse(row.capturedAt), predicted = Date.parse(row.predictedAt), kickoff = row.kickoff.getTime();
    if (!vector(row.model) || !Number.isFinite(captured) || !Number.isFinite(predicted)
      || predicted > captured || captured >= kickoff || Date.parse(row.auditKickoff) !== kickoff
      || Number(row.auditModelVersion) !== row.modelVersion) return [];
    return [{ fixtureId: row.fixtureId, homeName: row.homeName, awayName: row.awayName,
      kickoff: row.kickoff.toISOString(), modelVersion: row.modelVersion, capturedAt: new Date(captured).toISOString(),
      probabilities: row.model, market: ["PANEL", "PINNACLE_SINGLE"].includes(row.quality) && vector(row.market) ? row.market : null,
      quality: row.quality }];
  }).slice(0, 200);
}

/** Authorization is checked by the route, not cached with the shared domain payload. */
export async function loadOneXTwoDailyForecasts(date: string) {
  return sharedReadCache.read(`one-x-two-daily:v1:${date}`, 60_000, async () => {
    const bounds = pragueDateBounds(date);
    const rows = await prisma.$queryRaw<Row[]>(oneXTwoDailyQuery(bounds.start, bounds.end));
    return { outcomePredictions: normalizeOneXTwoDaily(rows), outcomePredictionsTruncated: rows.length > 200 };
  });
}
