import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { localDateKey } from '../competitionGrouping';
import { pragueDateBounds } from '../recentWindow';
import { aiFlags, selectAI } from '../picks/aiResearch';
import { AI_ARTIFACT_ID, AI_RESEARCH_POLICY, AI_LEAGUES, AI_ACTIVE_SEASON, buildAIBaseForecasts } from '../picks/aiProduction';
import { comparableMarketQuote } from '../picks/comparableMarketQuote';
import { parseBooks } from '../picks/books';
import { resolvedStrategyOutcome } from '../picks/strategyOutcome';
import { randomUUID } from 'node:crypto';
import { upsertIncident } from '../operations';

const KEY = 'ai-research-day:v1:';
export interface AIResearchDay {
  version: 1; date: string; asOf: string; artifactId: string; research: true;
  forecasts: Array<{ fixtureId: number; homeName: string; awayName: string; kickoff: string; probability: number; outcome: string }>;
  picks: Array<{ id: string; fixtureId: number; homeName: string; awayName: string; kickoff: string; probability: number;
    odds: number; bookmaker: string; quotedAt: string; verifiedAt?: string; outcome: string; profit: number | null; priceClv: number | null; currentEligible: boolean }>;
  rejected: Array<{ fixtureId: number; reason: string }>;
  summary?: { forecasts: number; evaluated: number; logLoss: number | null; brier: number | null; priced: number; settledPicks: number; won: number; profit: number; roi: number | null; priceClv: number | null; coverage30: number | null; asOf: string };
}
const json = (x: unknown) => JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue;

/** Called by the existing selection batch, never from a page/Telegram read. */
export async function runAIResearch(now = new Date(), settle = false) {
  if (!aiFlags().inference && !settle) return { status: 'DISABLED' };
  const started = Date.now(), owner = randomUUID(), key = 'ai-research:lease:v1';
  const expiresAt = new Date(+now + 60_000);
  const lease = await prisma.$executeRaw`INSERT INTO "ApiCache" ("key","payload","expiresAt","updatedAt")
    VALUES (${key},${JSON.stringify({ owner })}::jsonb,${expiresAt},${now}) ON CONFLICT ("key") DO UPDATE
    SET "payload"=EXCLUDED."payload","expiresAt"=EXCLUDED."expiresAt","updatedAt"=EXCLUDED."updatedAt"
    WHERE "ApiCache"."expiresAt" <= ${now}`;
  if (!lease) return { status: 'LEASE_HELD' };
  try {
    const history = await prisma.fixturePrediction.findMany({ where: { leagueId: { in: AI_LEAGUES }, season: AI_ACTIVE_SEASON },
      select: { fixtureId: true, leagueId: true, season: true, homeTeamId: true, awayTeamId: true, homeName: true, awayName: true,
        kickoff: true, status: true, homeGoals: true, awayGoals: true, available: true, modelContext: true }, take: 2001 });
    if (history.length > 2000) throw Error('AI_HISTORY_BOUND_EXCEEDED');
    let rejected: AIResearchDay['rejected'] = [];
    let captured = 0;
    if (!settle && aiFlags().inference) {
      const upcoming = history.filter(r => r.status === 'NS' && +r.kickoff >= +now + 30 * 60_000 && +r.kickoff <= +now + 2 * 86400_000).sort((a, b) => +a.kickoff - +b.kickoff || a.fixtureId - b.fixtureId);
      const existing = await prisma.aIForecastSnapshot.findMany({ where: { artifactId: AI_ARTIFACT_ID, fixtureId: { in: upcoming.map(r => r.fixtureId) } }, select: { fixtureId: true } });
      const known = new Set(existing.map(r => r.fixtureId));
      const targets = upcoming.filter(r => !known.has(r.fixtureId)).slice(0, 50);
      if (Date.now() - started < 6000 && targets.length) {
        const calculated = buildAIBaseForecasts(history, targets, now); rejected = calculated.rejected;
        const byId = new Map(targets.map(r => [r.fixtureId, r]));
        const batch = calculated.output.map(p => { const f = byId.get(p.fixtureId)!; return {
          ...p, artifactId: AI_ARTIFACT_ID, policyVersion: AI_RESEARCH_POLICY, modelVersion: 1, modelContext: 'LEAGUE',
          leagueId: f.leagueId, season: f.season, homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
          homeName: f.homeName, awayName: f.awayName, kickoff: f.kickoff, capturedAt: now, inputAudit: json(p.inputAudit),
        }; });
        captured = (await prisma.aIForecastSnapshot.createMany({ data: batch, skipDuplicates: true })).count;
      }
    }
    // All forecasts settle independently of whether a priced opportunity exists.
    if (settle) {
      const forecasts = await prisma.aIForecastSnapshot.findMany({ where: { artifactId: AI_ARTIFACT_ID,
        OR: [{ outcome: 'PENDING' }, { kickoff: { gte: new Date(+now - 30 * 86400_000) } }] }, take: 500 });
      const byId = new Map(history.map(r => [r.fixtureId, r]));
      const updates = forecasts.flatMap(row => {
        const f = byId.get(row.fixtureId);
        if (!f || f.homeTeamId !== row.homeTeamId || f.awayTeamId !== row.awayTeamId) return [];
        const voided = ['CANC', 'ABD', 'AWD', 'WO'].includes(f.status);
        const hit = f.status === 'FT' ? resolvedStrategyOutcome({ market: 'OVER_25', side: 'OVER', line: 2.5, homeGoals: f.homeGoals, awayGoals: f.awayGoals, actualCount: null }) : null;
        if (!voided && hit == null) return [];
        const outcome = voided ? 'VOID' : hit ? 'WON' : 'LOST';
        if (row.outcome === outcome && row.homeGoals === f.homeGoals && row.awayGoals === f.awayGoals) return [];
        return [{ id: row.id, outcome, homeGoals: f.homeGoals, awayGoals: f.awayGoals }];
      });
      if (updates.length) await prisma.$executeRaw`UPDATE "AIForecastSnapshot" AS f
        SET "outcome"=v.outcome, "homeGoals"=v.home, "awayGoals"=v.away, "settledAt"=${now}
        FROM (VALUES ${Prisma.join(updates.map(u => Prisma.sql`(${u.id}::text,${u.outcome}::text,${u.homeGoals}::integer,${u.awayGoals}::integer)`))})
        AS v(id,outcome,home,away) WHERE f."id"=v.id`;
    }
    if (!settle && aiFlags().opportunities && Date.now() - started < 8000) {
      const forecasts = await prisma.aIForecastSnapshot.findMany({ where: { artifactId: AI_ARTIFACT_ID, kickoff: { gte: new Date(+now + 30 * 60_000), lte: new Date(+now + 2 * 86400_000) }, outcome: 'PENDING' }, take: 50 });
      const quotes = await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: forecasts.map(r => r.fixtureId) }, status: 'NS', available: true },
        select: { fixtureId: true, kickoff: true, homeTeamId: true, awayTeamId: true, oddsCurrentAt: true, oddsCurrentBooks: true } });
      const byId = new Map(quotes.map(r => [r.fixtureId, r]));
      const signals = forecasts.flatMap(f => {
        const q = byId.get(f.fixtureId);
        if (!q?.oddsCurrentAt || +q.kickoff !== +f.kickoff || q.homeTeamId !== f.homeTeamId || q.awayTeamId !== f.awayTeamId) return [];
        const quote = comparableMarketQuote({ books: parseBooks(q.oddsCurrentBooks), market: 'OVER_25', side: 'OVER', line: 2.5, sampledAt: q.oddsCurrentAt });
        if (quote.decimalOdds == null || quote.fairProbability == null || !quote.bookmaker) return [];
        const selected = selectAI('OVER_25', [f.probability], { coverage: f.coverage, homeSample: f.homeSample, awaySample: f.awaySample, severeWarning: false },
          [{ side: 'OVER', odds: quote.decimalOdds, fairProbability: quote.fairProbability, bookmaker: quote.bookmaker, quotedAt: q.oddsCurrentAt.toISOString(), direct: true, complete: true }], f.kickoff, now);
        if (!selected) return [];
        return [{ fixtureId: f.fixtureId, leagueId: f.leagueId, kickoff: f.kickoff, market: 'OVER_25', side: 'OVER', line: 2.5,
          modelProbability: f.probability, openMarketProbability: quote.fairProbability, modelContext: 'LEAGUE', modelVersion: 1, contextVersion: 1,
          policyVersion: AI_RESEARCH_POLICY, publishedTip: false, openedAt: now, quotedAt: q.oddsCurrentAt, decimalOdds: quote.decimalOdds, bookmaker: quote.bookmaker,
          openingBookmakerId: quote.bookmakerId, openingBookmaker: quote.bookmaker, openingDecimalOdds: quote.decimalOdds,
          openingOppositeOdds: quote.oppositeOdds, openingLine: 2.5, openingBenchmarkQuality: quote.benchmarkQuality,
          openingBenchmarkProbability: quote.fairProbability, clvMethodVersion: 2 }];
      });
      if (signals.length) await prisma.marketSignalSnapshot.createMany({ data: signals, skipDuplicates: true });
    }
    const dates = [localDateKey(now), localDateKey(new Date(+now - 86400_000))];
    if (settle) await refreshAIResearchSummary(now);
    for (const date of dates) await refreshAIResearchDay(date, now, settle ? undefined : rejected);
    return { status: Date.now() - started >= 8000 ? 'TIME_BUDGET' : 'COMPLETED', captured, rejected, durationMs: Date.now() - started };
  } finally { await prisma.apiCache.deleteMany({ where: { key, payload: { path: ['owner'], equals: owner } } }); }
}

async function refreshAIResearchDay(date: string, now: Date, rejected?: AIResearchDay['rejected']) {
  const prior = rejected === undefined ? await readAIResearchDay(date) : null;
  const bounds = pragueDateBounds(date);
  const [forecasts, picks, summary] = await Promise.all([
    prisma.aIForecastSnapshot.findMany({ where: { artifactId: AI_ARTIFACT_ID, kickoff: { gte: bounds.start, lt: bounds.end } }, omit: { inputAudit: true }, orderBy: [{ kickoff: 'asc' }, { fixtureId: 'asc' }] }),
    prisma.marketSignalSnapshot.findMany({ where: { policyVersion: AI_RESEARCH_POLICY, kickoff: { gte: bounds.start, lt: bounds.end } },
      select: { id: true, fixtureId: true, decimalOdds: true, bookmaker: true, quotedAt: true, priceClv: true } }),
    prisma.apiCache.findUnique({ where: { key: 'ai-research-summary:v1' }, select: { payload: true } }),
  ]);
  const byId = new Map(forecasts.map(f => [f.fixtureId, f]));
  const offers = picks.length ? await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: picks.map(p => p.fixtureId) }, status: 'NS', available: true },
    select: { fixtureId: true, kickoff: true, homeTeamId: true, awayTeamId: true, oddsCurrentAt: true, oddsCurrentBooks: true } }) : [];
  const offersById = new Map(offers.map(o => [o.fixtureId, o]));
  const payload: AIResearchDay = { version: 1, date, asOf: now.toISOString(), artifactId: AI_ARTIFACT_ID, research: true,
    ...(summary ? { summary: summary.payload as unknown as AIResearchDay['summary'] } : {}),
    forecasts: forecasts.map(f => ({ fixtureId: f.fixtureId, homeName: f.homeName, awayName: f.awayName, kickoff: f.kickoff.toISOString(), probability: f.probability, outcome: f.outcome })),
    picks: picks.flatMap(p => { const f = byId.get(p.fixtureId); if (!f || p.decimalOdds == null || !p.bookmaker || !p.quotedAt) return [];
      const offer = offersById.get(p.fixtureId), books = parseBooks(offer?.oddsCurrentBooks);
      const current = offer?.oddsCurrentAt ? comparableMarketQuote({ books, market: 'OVER_25', side: 'OVER', line: 2.5, sampledAt: offer.oddsCurrentAt }) : null;
      // Never relabel the immutable accounting price as a new quote. If it vanished, hide the recommendation, not its history.
      const samePrice = books.some(b => b.name === p.bookmaker && b.over25 === p.decimalOdds && b.under25 != null);
      const currentEligible = !!offer && +offer.kickoff === +f.kickoff && offer.homeTeamId === f.homeTeamId && offer.awayTeamId === f.awayTeamId
        && samePrice && current?.fairProbability != null && !!selectAI('OVER_25', [f.probability],
          { coverage: f.coverage, homeSample: f.homeSample, awaySample: f.awaySample, severeWarning: false },
          [{ side: 'OVER', odds: p.decimalOdds, fairProbability: current.fairProbability, bookmaker: p.bookmaker, quotedAt: offer.oddsCurrentAt!.toISOString(), direct: true, complete: true }], f.kickoff, now);
      return [{ id: p.id, fixtureId: f.fixtureId, homeName: f.homeName, awayName: f.awayName, kickoff: f.kickoff.toISOString(), probability: f.probability, currentEligible,
        odds: p.decimalOdds, bookmaker: p.bookmaker, quotedAt: p.quotedAt.toISOString(),
        ...(currentEligible ? { verifiedAt: offer!.oddsCurrentAt!.toISOString() } : {}), outcome: f.outcome,
        profit: f.outcome === 'WON' ? p.decimalOdds - 1 : f.outcome === 'LOST' ? -1 : f.outcome === 'VOID' ? 0 : null, priceClv: p.priceClv }]; }), rejected: rejected ?? prior?.rejected ?? [] };
  if (Buffer.byteLength(JSON.stringify(payload)) > 250_000) throw Error('AI_PROJECTION_TOO_LARGE');
  const key = KEY + date, expiresAt = new Date(+now + 90 * 86400_000);
  await prisma.apiCache.upsert({ where: { key }, create: { key, payload: json(payload), expiresAt }, update: { payload: json(payload), expiresAt } });
  await prisma.apiCache.deleteMany({ where: { key: { startsWith: KEY }, expiresAt: { lt: now } } });
}

/** SQL over scalar, version-scoped rows; never runs on a read request. Corrections replace contributions. */
async function refreshAIResearchSummary(now: Date) {
  type Row = { forecasts: number; evaluated: number; logLoss: number | null; brier: number | null; priced: number; settledPicks: number; won: number; profit: number; priceClv: number | null; primary: number };
  const rows = await prisma.$queryRaw<Row[]>`SELECT count(*)::int AS "forecasts",
    count(*) FILTER (WHERE f."outcome" IN ('WON','LOST'))::int AS "evaluated",
    avg(-ln(GREATEST(0.000000001, CASE WHEN f."outcome"='WON' THEN f."probability" ELSE 1-f."probability" END))) FILTER (WHERE f."outcome" IN ('WON','LOST'))::float8 AS "logLoss",
    avg(power(f."probability"-CASE WHEN f."outcome"='WON' THEN 1 ELSE 0 END,2)) FILTER (WHERE f."outcome" IN ('WON','LOST'))::float8 AS "brier",
    count(s."id")::int AS "priced", count(s."id") FILTER (WHERE f."outcome" IN ('WON','LOST'))::int AS "settledPicks",
    count(s."id") FILTER (WHERE f."outcome"='WON')::int AS "won",
    COALESCE(sum(CASE WHEN s."id" IS NOT NULL AND f."outcome"='WON' THEN s."decimalOdds"-1 WHEN s."id" IS NOT NULL AND f."outcome"='LOST' THEN -1 ELSE 0 END),0)::float8 AS "profit",
    avg(s."priceClv") FILTER (WHERE f."outcome" IN ('WON','LOST') AND s."clvMethodVersion"=2 AND s."closingFreshness" IN ('PRIMARY_30','FALLBACK_75'))::float8 AS "priceClv",
    count(s."id") FILTER (WHERE f."outcome" IN ('WON','LOST') AND s."closingFreshness"='PRIMARY_30')::int AS "primary"
    FROM "AIForecastSnapshot" f LEFT JOIN "MarketSignalSnapshot" s ON s."fixtureId"=f."fixtureId" AND s."market"='OVER_25' AND s."policyVersion"=${AI_RESEARCH_POLICY}
    WHERE f."artifactId"=${AI_ARTIFACT_ID} AND f."policyVersion"=${AI_RESEARCH_POLICY}`;
  const r = rows[0];
  if (!r) return;
  const payload = json({ ...r, roi: r.settledPicks ? r.profit / r.settledPicks : null, coverage30: r.settledPicks ? r.primary / r.settledPicks : null, asOf: now.toISOString() });
  const key = 'ai-research-summary:v1', expiresAt = new Date(+now + 90 * 86400_000);
  await prisma.apiCache.upsert({ where: { key }, create: { key, payload, expiresAt }, update: { payload, expiresAt } });
}
export async function readAIResearchDay(date: string): Promise<AIResearchDay | null> {
  const row = await prisma.apiCache.findUnique({ where: { key: KEY + date }, select: { payload: true } });
  return row?.payload as unknown as AIResearchDay | null ?? null;
}
export async function safeRunAIResearch(now: Date, settle = false) {
  if (!aiFlags().inference && !settle) return { status: 'DISABLED' };
  try { return await runAIResearch(now, settle); }
  catch (e) { await upsertIncident({ fingerprint: 'ai-research:batch', kind: 'AI_RESEARCH', severity: 'WARNING', message: 'AI výzkum přeskočen; hlavní model pokračuje.', details: { error: e instanceof Error ? e.message : String(e) } }).catch(() => undefined); return { status: 'FAILED' }; }
}
