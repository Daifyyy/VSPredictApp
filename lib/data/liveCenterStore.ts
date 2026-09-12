import type { ApiFixture, ApiLiveOdds } from "./apiFootball";
import { fetchFixtureEvents, fetchFixtureStatistics, fetchLiveOdds, fetchVenue } from "./apiFootball";
import { prisma } from "@/lib/db";
import { statsToMetrics } from "./realRepository";
import { buildMatchEvents } from "@/lib/stats/matchEvents";
import { calculateLiveModel, evaluateLiveCandidate, LIVE_MODEL_VERSION, LIVE_POLICY_VERSION, type LiveProbabilities } from "@/lib/picks/liveModel";
import type { LiveCandidateSnapshot, Prisma } from "@prisma/client";
import { ACTIVE_PROGRAM_CLUB_LEAGUE_IDS } from "./catalog";
import { saveLineup } from "./personnelShadow";

type Price = { bookmakerId: number | null; bookmaker: string; marketId: number; market: "LIVE_1X2" | "LIVE_GOALS" | "LIVE_BTTS"; side: string; line: number | null; odds: number; main: boolean; blocked: boolean; stopped: boolean; sourceAt: Date | null };
const preferredBooks = [4, 8, 6, 11, 2];
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const lineKey = (line: number | null) => line == null ? "NONE" : line.toFixed(3);

function sideAndLine(value: string, handicap: unknown): { side: string; line: number | null } {
  const text = `${value} ${handicap ?? ""}`.trim();
  const line = num(text.match(/-?\d+(?:\.\d+)?/)?.[0]);
  if (/home|1$/i.test(value)) return { side: "HOME", line: null };
  if (/draw|^x$/i.test(value)) return { side: "DRAW", line: null };
  if (/away|2$/i.test(value)) return { side: "AWAY", line: null };
  if (/over/i.test(value)) return { side: "OVER", line };
  if (/under/i.test(value)) return { side: "UNDER", line };
  if (/yes/i.test(value)) return { side: "YES", line: null };
  if (/no/i.test(value)) return { side: "NO", line: null };
  return { side: value.toUpperCase(), line };
}

export function parseLivePrices(raw: ApiLiveOdds): Price[] {
  const out: Price[] = [];
  for (const item of raw) for (const book of item.bookmakers) for (const bet of book.bets) {
    const name = bet.name?.toLowerCase() ?? "";
    const market = /both.*score|btts/.test(name) ? "LIVE_BTTS" : /goal.*over|over.*under|total.*goal/.test(name) ? "LIVE_GOALS" : /match winner|1x2|winner/.test(name) ? "LIVE_1X2" : null;
    if (!market) continue;
    for (const value of bet.values) {
      const odds = num(value.odd);
      if (odds == null || odds <= 1) continue;
      const parsed = sideAndLine(value.value, value.handicap);
      const parsedSourceAt = item.update ? new Date(item.update) : null;
      out.push({ bookmakerId: book.id ?? null, bookmaker: book.name, marketId: bet.id, market, side: parsed.side, line: parsed.line, odds, main: value.main ?? false, blocked: item.fixture.status?.blocked ?? value.suspended ?? false, stopped: item.fixture.status?.stopped ?? false, sourceAt: parsedSourceAt && Number.isFinite(parsedSourceAt.getTime()) ? parsedSourceAt : null });
    }
  }
  return out;
}

function chooseBook(prices: Price[]): Price[] {
  const ids = [...preferredBooks, ...prices.map((p) => p.bookmakerId).filter((v): v is number => v != null)];
  const id = ids.find((candidate) => prices.some((p) => p.bookmakerId === candidate));
  const name = id == null ? prices[0]?.bookmaker : null;
  return prices.filter((p) => id != null ? p.bookmakerId === id : p.bookmaker === name);
}

function fairProbability(price: Price, all: Price[]): number | null {
  const same = all.filter((p) => p.market === price.market && (price.market !== "LIVE_GOALS" || p.line === price.line));
  const required = price.market === "LIVE_1X2" ? ["HOME", "DRAW", "AWAY"] : price.market === "LIVE_GOALS" ? ["OVER", "UNDER"] : ["YES", "NO"];
  const values = required.map((side) => same.find((p) => p.side === side)?.odds ?? null);
  if (values.some((v) => v == null)) return null;
  const inv = values.map((v) => 1 / v!); const sum = inv.reduce((a, b) => a + b, 0);
  return inv[required.indexOf(price.side)] / sum;
}

function probabilityFor(p: LiveProbabilities, price: Price): number | null {
  if (price.market === "LIVE_1X2") return price.side === "HOME" ? p.home : price.side === "DRAW" ? p.draw : price.side === "AWAY" ? p.away : null;
  if (price.market === "LIVE_BTTS") return price.side === "YES" ? p.bttsYes : price.side === "NO" ? 1 - p.bttsYes : null;
  if (price.line == null) return null;
  const over = p.totalOver[price.line.toFixed(1)];
  return over == null ? null : price.side === "OVER" ? over : price.side === "UNDER" ? 1 - over : null;
}

export async function captureLiveFixture(fixture: ApiFixture, now = new Date()) {
  // Live sběr běží velmi často. Celý FixturePrediction obsahuje několik velkých JSON
  // sloupců s kurzovými knihami a časovou řadou, které live model vůbec nepoužívá.
  const prediction = await prisma.fixturePrediction.findUnique({
    where: { fixtureId: fixture.fixture.id },
    select: { lambdaHome: true, lambdaAway: true, readinessSample: true, lowConfidence: true },
  });
  const minute = fixture.fixture.status.elapsed ?? 0;
  const [rawStats, rawEvents, rawOdds] = await Promise.all([fetchFixtureStatistics(fixture.fixture.id), fetchFixtureEvents(fixture.fixture.id), fetchLiveOdds(fixture.fixture.id)]);
  const home = statsToMetrics(rawStats.find((row) => row.team.id === fixture.teams.home.id) ?? null);
  const away = statsToMetrics(rawStats.find((row) => row.team.id === fixture.teams.away.id) ?? null);
  const events = buildMatchEvents(rawEvents);
  const observedAt = new Date(Math.floor(now.getTime() / 30_000) * 30_000);
  const match = await prisma.liveMatchSnapshot.upsert({
    where: { fixtureId_observedAt: { fixtureId: fixture.fixture.id, observedAt } },
    update: {},
    create: { fixtureId: fixture.fixture.id, leagueId: fixture.league.id, observedAt, minute, status: fixture.fixture.status.short, homeGoals: fixture.goals.home, awayGoals: fixture.goals.away, homeTeamId: fixture.teams.home.id, awayTeamId: fixture.teams.away.id, venueId: fixture.fixture.venue?.id ?? null, venueName: fixture.fixture.venue?.name ?? null, homeStats: json(home), awayStats: json(away), events: json(events), sourceAt: now },
  });
  // The enriched fixture payload may already contain official lineups. Persist them without
  // another provider request so Match Center can display the same immutable audit source.
  for (const lineup of fixture.lineups ?? []) {
    await saveLineup(fixture.fixture.id, new Date(fixture.fixture.date), lineup, now);
  }
  if (fixture.fixture.venue?.id) {
    const existing = await prisma.venueCache.findUnique({ where: { venueId: fixture.fixture.venue.id } });
    if (!existing || now.getTime() - existing.fetchedAt.getTime() > 30 * 86_400_000) {
      const venue = (await fetchVenue(fixture.fixture.venue.id))[0];
      if (venue) await prisma.venueCache.upsert({ where: { venueId: venue.id }, update: { name: venue.name, address: venue.address, city: venue.city, capacity: venue.capacity, surface: venue.surface, imageUrl: venue.image, fetchedAt: now }, create: { venueId: venue.id, name: venue.name, address: venue.address, city: venue.city, capacity: venue.capacity, surface: venue.surface, imageUrl: venue.image, fetchedAt: now } });
    }
  }
  const prices = chooseBook(parseLivePrices(rawOdds));
  await prisma.liveOddsSnapshot.createMany({ data: prices.map((p) => ({ fixtureId: fixture.fixture.id, observedAt, bookmakerId: p.bookmakerId, bookmaker: p.bookmaker, marketId: p.marketId, market: p.market, side: p.side, line: p.line, lineKey: lineKey(p.line), decimalOdds: p.odds, main: p.main, blocked: p.blocked, stopped: p.stopped, sourceAt: p.sourceAt })), skipDuplicates: true });
  const oddsRows = await prisma.liveOddsSnapshot.findMany({
    where: { fixtureId: fixture.fixture.id, observedAt },
    select: { id: true, market: true, side: true, line: true },
  });
  if (!prediction || prediction.lowConfidence || minute <= 0 || fixture.goals.home == null || fixture.goals.away == null) return { match, model: null, candidates: [] };
  const modelValue = calculateLiveModel({ minute, scoreHome: fixture.goals.home, scoreAway: fixture.goals.away, preMatchLambdaHome: prediction.lambdaHome, preMatchLambdaAway: prediction.lambdaAway, readinessSample: prediction.readinessSample, lowConfidence: prediction.lowConfidence, home, away });
  const model = await prisma.liveModelSnapshot.upsert({ where: { matchSnapshotId_modelVersion: { matchSnapshotId: match.id, modelVersion: LIVE_MODEL_VERSION } }, update: {}, create: { fixtureId: fixture.fixture.id, matchSnapshotId: match.id, calculatedAt: observedAt, minute, modelVersion: LIVE_MODEL_VERSION, probabilities: json(modelValue.probabilities), remainingLambdaHome: modelValue.remainingLambdaHome, remainingLambdaAway: modelValue.remainingLambdaAway, inputs: json(modelValue.inputs), lowConfidence: modelValue.lowConfidence } });
  const previous = await prisma.liveModelSnapshot.findFirst({ where: { fixtureId: fixture.fixture.id, calculatedAt: { lt: observedAt } }, orderBy: { calculatedAt: "desc" }, select: { calculatedAt: true, probabilities: true } });
  const previousOdds = previous ? await prisma.liveOddsSnapshot.findMany({ where: { fixtureId: fixture.fixture.id, observedAt: { lte: previous.calculatedAt } }, orderBy: { observedAt: "desc" }, take: 30 }) : [];
  const previousProbs = previous?.probabilities as unknown as LiveProbabilities | undefined;
  const candidates: LiveCandidateSnapshot[] = [];
  const candidateEnabled = ACTIVE_PROGRAM_CLUB_LEAGUE_IDS.includes(fixture.league.id);
  if (!candidateEnabled) return { match, model, candidates };
  for (const market of ["LIVE_1X2", "LIVE_GOALS", "LIVE_BTTS"] as const) {
    const available = prices.filter((p) => p.market === market && !p.blocked && !p.stopped && (market !== "LIVE_GOALS" || p.main));
    let best: { price: Price; rowId: string; prob: number; fair: number; gate: ReturnType<typeof evaluateLiveCandidate> } | null = null;
    for (const price of available) {
      const prob = probabilityFor(modelValue.probabilities, price); const fair = fairProbability(price, available);
      if (prob == null || fair == null) continue;
      const previousProb = previousProbs ? probabilityFor(previousProbs, price) : null;
      const priorRow = previousOdds.find((row) => row.market === market && row.side === price.side && row.lineKey === lineKey(price.line) && row.bookmaker === price.bookmaker);
      const priorBook = previousOdds.filter((row) => row.bookmaker === price.bookmaker).map((row) => ({ bookmakerId: row.bookmakerId, bookmaker: row.bookmaker, marketId: row.marketId, market: row.market as Price["market"], side: row.side, line: row.line, odds: row.decimalOdds, main: row.main, blocked: row.blocked, stopped: row.stopped, sourceAt: row.sourceAt }));
      const previousFair = priorRow ? fairProbability({ ...price, odds: priorRow.decimalOdds }, priorBook) : null;
      const confirmed = previousProb != null && priorRow != null && previousFair != null && previousProb - previousFair >= .05 && previousProb * priorRow.decimalOdds - 1 >= .04;
      const gate = evaluateLiveCandidate({ minute, lowConfidence: modelValue.lowConfidence, blocked: price.blocked, stopped: price.stopped, modelProbability: prob, marketProbability: fair, decimalOdds: price.odds, confirmed, synchronized: !price.sourceAt || Math.abs(price.sourceAt.getTime() - observedAt.getTime()) <= 90_000 });
      const rowId = oddsRows.find((r) => r.market === market && r.side === price.side && r.line === price.line)?.id;
      if (rowId && (!best || gate.ev > best.gate.ev)) best = { price, rowId, prob, fair, gate };
    }
    if (best?.gate.status === "candidate") candidates.push(await prisma.liveCandidateSnapshot.upsert({ where: { fixtureId_market_policyVersion: { fixtureId: fixture.fixture.id, market, policyVersion: LIVE_POLICY_VERSION } }, update: {}, create: { fixtureId: fixture.fixture.id, leagueId: fixture.league.id, kickoff: new Date(fixture.fixture.date), homeTeamId: fixture.teams.home.id, awayTeamId: fixture.teams.away.id, homeName: fixture.teams.home.name, awayName: fixture.teams.away.name, market, side: best.price.side, line: best.price.line, modelVersion: LIVE_MODEL_VERSION, minute, scoreHome: fixture.goals.home, scoreAway: fixture.goals.away, modelProbability: best.prob, marketProbability: best.fair, edge: best.gate.edge, expectedValue: best.gate.ev, decimalOdds: best.price.odds, bookmaker: best.price.bookmaker, qualifiedAt: observedAt, reason: best.gate.reason, modelSnapshotId: model.id, oddsSnapshotId: best.rowId } }));
  }
  return { match, model, candidates };
}

export async function liveCenterFromCache(fixtureId: number) {
  const [match, model, odds, candidates, prediction] = await Promise.all([
    prisma.liveMatchSnapshot.findFirst({ where: { fixtureId }, orderBy: { observedAt: "desc" } }),
    prisma.liveModelSnapshot.findFirst({ where: { fixtureId }, orderBy: { calculatedAt: "desc" } }),
    prisma.liveOddsSnapshot.findMany({ where: { fixtureId }, orderBy: { observedAt: "desc" }, take: 30 }),
    prisma.liveCandidateSnapshot.findMany({ where: { fixtureId }, orderBy: { qualifiedAt: "asc" } }),
    prisma.fixturePrediction.findUnique({ where: { fixtureId } }),
  ]);
  return { match, model, odds, candidates, prediction };
}

export async function settleLiveCandidates(fixture: ApiFixture, at = new Date()): Promise<number> {
  const home = fixture.score?.fulltime?.home ?? fixture.goals.home;
  const away = fixture.score?.fulltime?.away ?? fixture.goals.away;
  if (home == null || away == null) return 0;
  const rows = await prisma.liveCandidateSnapshot.findMany({ where: { fixtureId: fixture.fixture.id, settlementStatus: "PENDING" } });
  for (const row of rows) {
    const hit = row.market === "LIVE_1X2" ? (row.side === "HOME" ? home > away : row.side === "DRAW" ? home === away : home < away) : row.market === "LIVE_BTTS" ? (row.side === "YES" ? home > 0 && away > 0 : home === 0 || away === 0) : row.line != null ? (row.side === "OVER" ? home + away > row.line : home + away < row.line) : null;
    await prisma.liveCandidateSnapshot.update({ where: { id: row.id }, data: { settlementStatus: hit == null ? "VOID" : "SETTLED", hit, profit: hit == null ? 0 : hit ? row.decimalOdds - 1 : -1, settledAt: at } });
  }
  return rows.length;
}
