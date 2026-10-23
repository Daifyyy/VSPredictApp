/** Explicit offline dataset build. No database/provider imports or network calls. */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { AIFeatureBuilder, AI_FEATURE_NAMES, AI_FEATURE_GROUPS } from '../lib/picks/aiFeatures';
import { AI_PROTOCOL, type AIMatch, type AIFeatureRow } from '../lib/picks/aiResearch';
import { classifyCompetitionRound } from '../lib/stats/seasonPhases';
import { buildTeamAt, type HistoryMatch } from '../lib/picks/backtest';
import { compareTeams } from '../lib/stats/compare';
import { computeRatings, RATING_OPTIONS } from '../lib/stats/ratings';
import { DEFAULT_TUNING } from '../lib/stats/predict';
import { stabilizedSeasonBaseline } from '../lib/stats/seasonBaseline';
import type { SeasonInventory } from '../lib/stats/seasonInventory';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const root = realpathSync(process.cwd()), started = Date.now();
const sources: Array<{ file: string; hash: string }> = [];
let sourceBytes = 0;
function read(file: string) {
  const full = realpathSync(resolve(root, file)), rel = relative(root, full);
  if (rel.startsWith('..') || isAbsolute(rel)) throw Error('SOURCE_OUTSIDE_WORKSPACE');
  const raw = readFileSync(full, 'utf8'); sourceBytes += Buffer.byteLength(raw);
  if (sourceBytes > AI_PROTOCOL.maxCacheBytes / 2) throw Error('SOURCE_SIZE_LIMIT');
  sources.push({ file: rel.replaceAll('\\', '/'), hash: sha(raw) }); return JSON.parse(raw);
}
function save(file: string, content: string) {
  if (existsSync(file)) { if (readFileSync(file, 'utf8') !== content) throw Error('IMMUTABLE_DATASET_COLLISION'); return; }
  writeFileSync(file, content, { flag: 'wx' });
}
async function main() {
  if (process.argv.length > 2) throw Error('Pinned protocol: no dynamic tuning arguments');
  const matches: AIMatch[] = [], ids = new Set<number>(), rejects: Record<string, number> = {};
  const reject = (reason: string) => { rejects[reason] = (rejects[reason] ?? 0) + 1; };
  const base = '.cache/season-inventories';
  for (const name of readdirSync(base).filter(n => /^2026-09-20-\d+-(2025|2026)\.json$/.test(n)).sort()) {
    const inventory = read(`${base}/${name}`) as SeasonInventory;
    if (inventory.version !== 1 || inventory.pagination.total !== 1 || inventory.count !== inventory.fixtures.length || sha(JSON.stringify(inventory.fixtures)) !== inventory.sha256) throw Error('INVALID_INVENTORY');
    const statsPath = `.cache/backtest/stats-${inventory.leagueId}-${inventory.season}.json`;
    const stats = existsSync(statsPath) ? read(statsPath) as Record<string, { home?: Record<string, number>; away?: Record<string, number> }> : {};
    for (const f of inventory.fixtures) {
      if (ids.has(f.fixtureId)) throw Error('DUPLICATE_SOURCE_FIXTURE'); ids.add(f.fixtureId);
      if (f.status !== 'FT' || classifyCompetitionRound(f.round) !== 'REGULAR_SEASON') { reject('NOT_REGULAR_FT'); continue; }
      if (!Number.isFinite(Date.parse(f.kickoff)) || Date.parse(f.kickoff) + 10800000 >= Date.parse('2026-09-20')) { reject('AFTER_CUTOFF'); continue; }
      if (![f.fixtureId, f.homeTeamId, f.awayTeamId].every(n => Number.isInteger(n) && n > 0) || f.homeTeamId === f.awayTeamId
        || ![f.homeGoals, f.awayGoals].every(n => n != null && Number.isInteger(n) && n >= 0)) throw Error('INVALID_SOURCE_IDENTITY_OR_RESULT');
      const s = stats[String(f.fixtureId)];
      matches.push({ fixtureId: f.fixtureId, leagueId: inventory.leagueId, season: inventory.season, date: new Date(f.kickoff).toISOString(),
        homeId: f.homeTeamId, awayId: f.awayTeamId, homeGoals: f.homeGoals!, awayGoals: f.awayGoals!, homeMetrics: s?.home, awayMetrics: s?.away });
    }
  }
  matches.sort((a, b) => a.date.localeCompare(b.date) || a.fixtureId - b.fixtureId);
  const featureBuilder = new AIFeatureBuilder(), history = new Map<number, HistoryMatch[]>(), rows: AIFeatureRow[] = [];
  const days = new Map<string, AIMatch[]>();
  for (const m of matches) { const key = m.date.slice(0, 10); const group = days.get(key) ?? []; group.push(m); days.set(key, group); }
  let cursor = 0;
  for (const [day, targets] of days) {
    const origin = Date.parse(day);
    while (cursor < matches.length && Date.parse(matches[cursor].date) + 10800000 < origin) {
      const m = matches[cursor++]; featureBuilder.ingest(m);
      const pool = history.get(m.leagueId) ?? [];
      pool.push({ ...m, homeName: String(m.homeId), awayName: String(m.awayId), homeLogo: '', awayLogo: '' }); history.set(m.leagueId, pool);
    }
    const contexts = new Map<string, { pool: HistoryMatch[]; baseline: NonNullable<ReturnType<typeof stabilizedSeasonBaseline>>; ratings: ReturnType<typeof computeRatings>; league: { oneXTwo: [number, number, number]; over: number } }>();
    for (const m of targets) {
      const key = `${m.leagueId}:${m.season}`;
      if (!contexts.has(key)) {
        const pool = history.get(m.leagueId) ?? [];
        const totals = (season: number) => { const rs = pool.filter(r => r.season === season); return { matches: rs.length, homeGoals: rs.reduce((s, r) => s + r.homeGoals, 0), awayGoals: rs.reduce((s, r) => s + r.awayGoals, 0) }; };
        const baseline = stabilizedSeasonBaseline(totals(m.season), totals(m.season - 1));
        if (!baseline || pool.length < 20) { reject('BASELINE_WARMUP'); continue; }
        const ratingPool = pool.filter(r => Date.parse(r.date) >= origin - 540 * 86400000).map(r => ({ ...r, homeXg: r.homeMetrics?.XG, awayXg: r.awayMetrics?.XG }));
        const counts = [1, 1, 1]; let over = 1;
        for (const r of pool) { counts[r.homeGoals > r.awayGoals ? 0 : r.homeGoals === r.awayGoals ? 1 : 2]++; over += Number(r.homeGoals + r.awayGoals > 2); }
        contexts.set(key, { pool, baseline, ratings: computeRatings(ratingPool, day, { ...RATING_OPTIONS, ...baseline, xgWeight: DEFAULT_TUNING.xgWeight }),
          league: { oneXTwo: counts.map(n => n / (pool.length + 3)) as [number, number, number], over: over / (pool.length + 2) } });
      }
      const ctx = contexts.get(key)!; const features = featureBuilder.predict(m);
      if (Math.min(features.homeSample, features.awaySample) < 5 || !ctx.ratings.has(m.homeId) || !ctx.ratings.has(m.awayId)) { reject('TEAM_WARMUP'); continue; }
      const home = buildTeamAt(ctx.pool, m.homeId, { name: String(m.homeId), logoUrl: '', leagueId: m.leagueId }, day, m.season);
      const away = buildTeamAt(ctx.pool, m.awayId, { name: String(m.awayId), logoUrl: '', leagueId: m.leagueId }, day, m.season);
      const p = compareTeams(home, away, new Date(day), { baseline: ctx.baseline, tuning: DEFAULT_TUNING,
        strength: { home: ctx.ratings.get(m.homeId)!, away: ctx.ratings.get(m.awayId)! } }, { crossSeasonForm: true }).prediction;
      if (!p?.available) { reject('MAIN_BASELINE_UNAVAILABLE'); continue; }
      rows.push({ ...features, fixtureId: m.fixtureId, leagueId: m.leagueId, kickoff: m.date, day,
        outcome: m.homeGoals > m.awayGoals ? 0 : m.homeGoals === m.awayGoals ? 1 : 2, over: Number(m.homeGoals + m.awayGoals > 2),
        baseline: { oneXTwo: [p.homeWin, p.draw, p.awayWin], over: p.over25 }, leagueBaseline: ctx.league });
    }
    if (Date.now() - started > AI_PROTOCOL.maxSeconds * 1000 || process.memoryUsage().rss > AI_PROTOCOL.maxRssBytes) throw Error('DATASET_BUDGET_EXCEEDED');
  }
  const dataset = { version: 1, kind: 'HISTORICAL_RECONSTRUCTION', independentHoldout: false, venueMetadataVerified: false,
    protocol: AI_PROTOCOL, protocolHash: sha(JSON.stringify(AI_PROTOCOL)), featureNames: AI_FEATURE_NAMES, featureGroups: AI_FEATURE_GROUPS,
    sources, codeHashes: ['scripts/buildAIResearchDataset.ts', 'lib/picks/aiFeatures.ts', 'lib/picks/aiResearch.ts', 'lib/picks/backtest.ts', 'lib/stats/compare.ts', 'lib/stats/predict.ts', 'lib/stats/ratings.ts', 'lib/stats/seasonBaseline.ts'].map(file => ({ file, hash: sha(readFileSync(file, 'utf8')) })),
    rows, excluded: rejects, sourceMatches: matches.length,
    limitations: ['Previously explored seasons; terminal test is not independently untouched.', 'Statistics revisions and historical ingestion times unknown.',
      'Legacy statistics have fixture-side identity, no original source timestamp.', 'Neutral venue metadata unavailable in season inventories; no activation until eligibility is independently verified.',
      'League-only rest/form omit other competitions.', 'Main baseline reconstructed with current core, not frozen production inference.', 'No historical executable prices; profitability cannot be evaluated.'] };
  const raw = JSON.stringify(dataset), hash = sha(raw);
  if (Buffer.byteLength(raw) > AI_PROTOCOL.maxCacheBytes / 2) throw Error('DATASET_SIZE_LIMIT');
  const dir = resolve('.runtime/ai-research'); mkdirSync(dir, { recursive: true });
  if (realpathSync(dir) !== dir) throw Error('SYMLINKED_DATASET_DIRECTORY');
  const path = resolve(dir, `${hash}.dataset.json`); save(path, raw);
  console.log(JSON.stringify({ path, hash, rows: rows.length, sourceMatches: matches.length, excluded: rejects, features: AI_FEATURE_NAMES.length,
    bytes: Buffer.byteLength(raw), seconds: (Date.now() - started) / 1000, databaseQueries: 0, providerCalls: 0 }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
