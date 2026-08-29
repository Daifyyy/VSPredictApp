import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PUBLIC_CLUB_LEAGUE_IDS, EURO_LEAGUE_IDS } from "@/lib/data/catalog";
import { closingSampleQuality, parseSeries } from "@/lib/picks/oddsSeries";
import { withApiUsage } from "@/lib/apiUsage";

export type CronHealthStatus = "HEALTHY" | "DEGRADED" | "FAILED";

export interface CronTelemetry {
  candidates?: number;
  processed?: number;
  errors?: number;
  apiCalls?: number;
  remaining?: number;
  cursor?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

function statusOf(stats: CronTelemetry): CronHealthStatus {
  const errors = stats.errors ?? 0;
  const processed = stats.processed ?? 0;
  if ((stats.remaining ?? 0) > 0 && stats.reason === "time-budget") return "DEGRADED";
  if (errors === 0) return "HEALTHY";
  return processed > 0 ? "DEGRADED" : "FAILED";
}

async function recordFailureIncident(job: string, runId: string, details: CronTelemetry) {
  const recent = await prisma.cronRun.count({
    where: {
      job,
      status: "FAILED",
      startedAt: { gte: new Date(Date.now() - 6 * 60 * 60_000) },
    },
  });
  if (recent < 2) return;
  await upsertIncident({
    fingerprint: `cron:${job}:consecutive-failure`,
    kind: "CRON_FAILURE",
    severity: "CRITICAL",
    message: `${job} selhal nejméně dvakrát během šesti hodin.`,
    details: { runId, ...details },
  });
}

export async function withCronRun<T extends CronTelemetry>(
  job: string,
  execute: () => Promise<T>
): Promise<T> {
  const startedAt = new Date();
  const run = await prisma.cronRun.create({ data: { job, status: "RUNNING", startedAt } });
  try {
    const measured = await withApiUsage(execute);
    const stats = { ...measured.value, apiCalls: measured.calls } as T;
    const finishedAt = new Date();
    const status = statusOf(stats);
    (stats as CronTelemetry).healthStatus = status;
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt,
        candidates: stats.candidates ?? 0,
        processed: stats.processed ?? 0,
        errors: stats.errors ?? 0,
        apiCalls: stats.apiCalls ?? 0,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        remaining: stats.remaining ?? 0,
        cursor: stats.cursor ?? null,
        reason: stats.reason ?? null,
        details: json(stats),
      },
    });
    if (status === "FAILED") await recordFailureIncident(job, run.id, stats);
    if (status === "DEGRADED") await upsertIncident({
      fingerprint: `cron:${job}:degraded`,
      kind: "CRON_DEGRADED",
      severity: "WARNING",
      message: `${job} dokončil jen část práce (${stats.errors ?? 0} chyb).`,
      details: { runId: run.id, ...stats },
    });
    if (status === "HEALTHY") {
      await resolveIncident(`cron:${job}:consecutive-failure`);
      await resolveIncident(`cron:${job}:degraded`);
    }
    return stats;
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt,
        errors: 1,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        reason: message,
      },
    }).catch(() => {});
    await recordFailureIncident(job, run.id, { errors: 1, reason: message }).catch(() => {});
    throw error;
  }
}

export async function upsertIncident(input: {
  fingerprint: string;
  kind: string;
  severity: string;
  message: string;
  details?: unknown;
}) {
  const previous = await prisma.dataIncident.findUnique({ where: { fingerprint: input.fingerprint }, select: { status: true } });
  const incident = await prisma.dataIncident.upsert({
    where: { fingerprint: input.fingerprint },
    create: {
      ...input,
      details: input.details == null ? undefined : json(input.details),
    },
    update: {
      kind: input.kind,
      severity: input.severity,
      status: "OPEN",
      message: input.message,
      details: input.details == null ? undefined : json(input.details),
      lastSeenAt: new Date(),
      resolvedAt: null,
    },
  });
  // Push je vyhrazen jen pro kritickĂ© incidenty. VarovĂˇnĂ­ o menĹˇĂ­m vzorku nebo
  // pokrytĂ­ zĹŻstĂˇvajĂ­ na dashboardu, kde majĂ­ kontext a nevytvĂˇĹ™ejĂ­ hluk.
  if ((!previous || previous.status === "RESOLVED") && input.severity === "CRITICAL") {
    const { sendOperationalAlert } = await import("@/lib/push");
    await sendOperationalAlert({
      fingerprint: input.fingerprint,
      title: "Football Insight · provozní incident",
      body: input.message,
    }).catch(() => {});
  }
  return incident;
}

export async function resolveIncident(fingerprint: string) {
  await prisma.dataIncident.updateMany({
    where: { fingerprint, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date(), lastSeenAt: new Date() },
  });
}

export async function recordCoverage(input: {
  category: string;
  eligible: number;
  covered: number;
  target: number;
  details?: unknown;
}) {
  const now = new Date();
  const asOf = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const ratio = input.eligible ? input.covered / input.eligible : 1;
  const status = ratio >= input.target ? "HEALTHY" : "DEGRADED";
  const details = input.details == null ? undefined : json(input.details);
  await prisma.pipelineCoverage.upsert({
    where: { category_asOf: { category: input.category, asOf } },
    create: { category: input.category, eligible: input.eligible, covered: input.covered, target: input.target, ratio, status, asOf, details },
    update: { eligible: input.eligible, covered: input.covered, target: input.target, ratio, status, details },
  });
  const fingerprint = `coverage:${input.category}`;
  if (status === "DEGRADED") await upsertIncident({
    fingerprint,
    kind: "COVERAGE",
    severity: "CRITICAL",
    message: `${input.category}: ${(ratio * 100).toFixed(1)} % (cíl ${(input.target * 100).toFixed(0)} %).`,
    details: { ...input, ratio },
  });
  else await resolveIncident(fingerprint);
  return { ratio, status };
}

const SUPPORTED_ODDS_LEAGUES = [...PUBLIC_CLUB_LEAGUE_IDS, ...EURO_LEAGUE_IDS];

export async function auditPipeline(now = new Date()) {
  const horizon = new Date(now.getTime() + 72 * 60 * 60_000);
  const recent = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const [future, settledCounts, kicked, overdue, latestRuns] = await Promise.all([
    prisma.fixturePrediction.findMany({
      where: { leagueId: { in: SUPPORTED_ODDS_LEAGUES }, kickoff: { gt: now, lte: horizon } },
      select: { fixtureId: true, oddsFetchedAt: true, oddsSeries: true },
    }),
    prisma.fixturePrediction.findMany({
      where: {
        leagueId: { in: SUPPORTED_ODDS_LEAGUES },
        kickoff: { gte: recent, lte: now },
        status: { in: ["FT", "AET", "PEN"] },
      },
      select: { fixtureId: true, homeTeamId: true, awayTeamId: true, lambdaCornersHome: true, lambdaCornersAway: true, lambdaCardsHome: true, lambdaCardsAway: true, lambdaFoulsHome: true, lambdaFoulsAway: true },
    }),
    prisma.fixturePrediction.findMany({
      where: { leagueId: { in: SUPPORTED_ODDS_LEAGUES }, kickoff: { gte: recent, lte: now } },
      select: { fixtureId: true, kickoff: true, oddsCloseAt: true },
    }),
    prisma.fixturePrediction.count({
      where: {
        leagueId: { in: SUPPORTED_ODDS_LEAGUES },
        status: { in: ["NS", "PST", "TBD", "SUSP", "INT"] },
        kickoff: { lt: new Date(now.getTime() - 6 * 60 * 60_000) },
      },
    }),
    prisma.cronRun.findMany({ orderBy: { startedAt: "desc" }, take: 40 }),
  ]);
  const actualRows = settledCounts.length ? await prisma.matchStatCache.findMany({
    where: { fixtureId: { in: settledCounts.map((row) => row.fixtureId) } },
    select: { fixtureId: true, teamId: true, corners: true, yellowCards: true, fouls: true },
  }) : [];
  const actualByFixture = new Map<number, typeof actualRows>();
  for (const row of actualRows) {
    const list = actualByFixture.get(row.fixtureId) ?? [];
    list.push(row);
    actualByFixture.set(row.fixtureId, list);
  }

  const opening = future.filter((row) => row.oddsFetchedAt != null).length;
  const series3 = future.filter((row) => parseSeries(row.oddsSeries).length >= 3).length;
  const closing = kicked.filter((row) => closingSampleQuality(row.kickoff, row.oddsCloseAt, now) === "fresh").length;
  const countCoverage = (market: "CORNERS" | "CARDS" | "FOULS") => {
    const eligible = settledCounts.filter((row) => market === "CORNERS"
      ? row.lambdaCornersHome != null && row.lambdaCornersAway != null
      : market === "CARDS" ? row.lambdaCardsHome != null && row.lambdaCardsAway != null
        : row.lambdaFoulsHome != null && row.lambdaFoulsAway != null);
    const covered = eligible.filter((row) => {
      const actual = actualByFixture.get(row.fixtureId) ?? [];
      const home = actual.find((item) => item.teamId === row.homeTeamId);
      const away = actual.find((item) => item.teamId === row.awayTeamId);
      return market === "CORNERS" ? home?.corners != null && away?.corners != null
        : market === "CARDS" ? home?.yellowCards != null && away?.yellowCards != null
          : home?.fouls != null && away?.fouls != null;
    }).length;
    return { category: `ACTUAL_${market}`, eligible: eligible.length, covered, target: .90 };
  };
  const rows = [
    { category: "OPENING", eligible: future.length, covered: opening, target: .95 },
    { category: "ODDS_SERIES_3", eligible: future.length, covered: series3, target: .90 },
    { category: "FRESH_CLOSE", eligible: kicked.length, covered: closing, target: .85 },
    countCoverage("CORNERS"),
    countCoverage("CARDS"),
    countCoverage("FOULS"),
  ].map((row) => ({ ...row, ratio: row.eligible ? row.covered / row.eligible : 1 }));

  const bucket = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  for (const row of rows) {
    const status = row.ratio >= row.target ? "HEALTHY" : "DEGRADED";
    await prisma.pipelineCoverage.upsert({
      where: { category_asOf: { category: row.category, asOf: bucket } },
      create: { ...row, asOf: bucket, status },
      update: { ...row, status },
    });
    const fingerprint = `coverage:${row.category}`;
    if (status === "DEGRADED") {
      await upsertIncident({
        fingerprint,
        kind: "COVERAGE",
        severity: row.category === "FRESH_CLOSE" ? "CRITICAL" : "WARNING",
        message: `${row.category}: ${(row.ratio * 100).toFixed(1)} % (cíl ${(row.target * 100).toFixed(0)} %).`,
        details: row,
      });
    } else await resolveIncident(fingerprint);
  }
  if (overdue > 0) await upsertIncident({
    fingerprint: "settlement:overdue",
    kind: "SETTLEMENT",
    severity: "CRITICAL",
    message: `${overdue} zápasů po plánovaném výkopu čeká déle než 6 hodin na ověření stavu. Otevřete Provoz a spusťte retry settlementu.`,
    details: { overdue },
  });
  else await resolveIncident("settlement:overdue");

  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const apiCallsToday = latestRuns.filter((run) => run.startedAt >= startOfDay).reduce((sum, run) => sum + run.apiCalls, 0);
  const openIncidents = await prisma.dataIncident.findMany({ where: { status: "OPEN" }, orderBy: { lastSeenAt: "desc" } });
  return { asOf: now.toISOString(), coverage: rows, overdue, apiCallsToday, apiDailyLimit: 7500, latestRuns, incidents: openIncidents };
}
