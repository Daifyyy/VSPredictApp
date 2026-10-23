import { Prisma } from '@prisma/client';

/** Explicit offline/admin audit only; never called by UI or normal prediction cron. */
export function oneXTwoProspectiveQuery(start: Date, end: Date) {
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || +end <= +start || +end - +start > 93 * 86400_000) throw Error('AUDIT_WINDOW_MAX_93_DAYS');
  return Prisma.sql`SELECT s.id, s."fixtureId", s."leagueId", s.kickoff, s."openedAt", s."modelVersion", s."contextVersion", s."modelContext",
    s."openingForecastAudit" - 'quotes' AS audit,
    p."homeTeamId", p."awayTeamId", p.kickoff AS "resultKickoff", p.status, p."homeGoals", p."awayGoals"
    FROM "MarketSignalSnapshot" s LEFT JOIN "FixturePrediction" p ON p."fixtureId" = s."fixtureId"
    WHERE s.market = '1X2' AND s."modelContext" = 'LEAGUE' AND s."openedAt" >= ${start} AND s."openedAt" < ${end}
      AND NOT EXISTS (SELECT 1 FROM "MarketSignalSnapshot" older
        WHERE older."fixtureId" = s."fixtureId" AND older.market = s.market AND older."modelContext" = s."modelContext"
          AND (older."openedAt", older.id) < (s."openedAt", s.id))
    ORDER BY s."openedAt", s.id LIMIT 10001`;
}
