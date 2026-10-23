/** Local quality migration only. No fitting, new exports, DB calls or production writes. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { AIFreshFeatureBuilder, AI_FEATURE_QUALITY_POLICY } from '../lib/picks/aiFeatureQuality';
import { AI_FEATURE_NAMES, AI_FEATURE_GROUPS } from '../lib/picks/aiFeatures';
import { AI_PROTOCOL, type AIMatch, type AIFeatureRow } from '../lib/picks/aiResearch';
import { classifyCompetitionRound } from '../lib/stats/seasonPhases';
import type { SeasonInventory } from '../lib/stats/seasonInventory';

const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');
const sourcePath = '.runtime/ai-research/404ac6e89bc10ca39cd17dc546a0636efcd66dd2df0a7eb90604b7514b1459a9.dataset.json';
const started = performance.now();
function main() {
  if (process.argv.length > 2) throw Error('QUALITY_PROTOCOL_HAS_NO_TUNING_ARGUMENTS');
  const text = readFileSync(sourcePath, 'utf8');
  if (!sourcePath.endsWith(`${hash(text)}.dataset.json`)) throw Error('INVALID_PARENT_DATASET_HASH');
  const source = JSON.parse(text) as { version: number; sources: Array<{ file: string; hash: string }>; rows: AIFeatureRow[]; limitations: string[] };
  if (source.version !== 1) throw Error('INVALID_PARENT_SCHEMA');
  const contents = new Map<string, string>();
  let bytes = 0;
  for (const s of source.sources) {
    if (!/^\.cache\/(season-inventories\/2026-09-20-\d+-\d+|backtest\/stats-\d+-\d+)\.json$/.test(s.file)) throw Error('UNSAFE_SOURCE_PATH');
    const raw = readFileSync(s.file, 'utf8');
    if (hash(raw) !== s.hash) throw Error('CHANGED_SOURCE_DATA');
    bytes += Buffer.byteLength(raw); if (bytes > AI_PROTOCOL.maxCacheBytes / 2) throw Error('SOURCE_BUDGET');
    contents.set(s.file, raw);
  }
  const matches: AIMatch[] = [], fixtureIds = new Set<number>();
  for (const [file, raw] of contents) {
    if (!file.includes('/season-inventories/')) continue;
    const inventory = JSON.parse(raw) as SeasonInventory;
    const stats = JSON.parse(contents.get(`.cache/backtest/stats-${inventory.leagueId}-${inventory.season}.json`) ?? '{}') as Record<string, { home?: Record<string, number>; away?: Record<string, number> }>;
    for (const f of inventory.fixtures) {
      if (f.status !== 'FT' || classifyCompetitionRound(f.round) !== 'REGULAR_SEASON') continue;
      if (Date.parse(f.kickoff) + 10800000 >= Date.parse('2026-09-20')) continue;
      if (fixtureIds.has(f.fixtureId)) throw Error('DUPLICATE_SOURCE_FIXTURE'); fixtureIds.add(f.fixtureId);
      if (f.homeGoals == null || f.awayGoals == null) throw Error('MISSING_RESULT');
      matches.push({ fixtureId: f.fixtureId, leagueId: inventory.leagueId, season: inventory.season, date: new Date(f.kickoff).toISOString(),
        homeId: f.homeTeamId, awayId: f.awayTeamId, homeGoals: f.homeGoals, awayGoals: f.awayGoals,
        homeMetrics: stats[String(f.fixtureId)]?.home, awayMetrics: stats[String(f.fixtureId)]?.away });
    }
  }
  matches.sort((a, b) => a.date.localeCompare(b.date) || a.fixtureId - b.fixtureId);
  const fixtures = new Map(matches.map(m => [m.fixtureId, m]));
  const builder = new AIFreshFeatureBuilder(); let cursor = 0;
  const modes: Record<string, number> = {}, reasons: Record<string, number> = {};
  let availableSum = 0, freshSum = 0, invalidatedValues = 0, peakRssBytes = process.memoryUsage().rss;
  const profileTimes: number[] = [];
  const rows = [...source.rows].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.fixtureId - b.fixtureId).map(row => {
    const target = fixtures.get(row.fixtureId); if (!target) throw Error('UNMATCHED_PARENT_FIXTURE');
    const origin = Date.parse(row.day);
    while (cursor < matches.length && Date.parse(matches[cursor].date) + 10800000 < origin) builder.ingest(matches[cursor++]);
    const before = performance.now();
    const { featureNames: _names, coreFeatureIndices: _core, ...profile } = builder.predict(target);
    profileTimes.push(performance.now() - before);
    if (_names.length !== AI_FEATURE_NAMES.length || _core.length === 0) throw Error('INVALID_FEATURE_SCHEMA');
    if (profile.latestHistory !== row.latestHistory || profile.homeSample !== row.homeSample || profile.awaySample !== row.awaySample) throw Error('CHANGED_HISTORY_COHORT');
    modes[profile.profileMode] = (modes[profile.profileMode] ?? 0) + 1;
    for (const warning of profile.warnings) reasons[warning] = (reasons[warning] ?? 0) + 1;
    availableSum += profile.availableCoverage; freshSum += profile.freshCoverage;
    row.values.slice(0, row.values.length / 2).forEach((v, i) => { if (v != null && profile.values[i] == null) invalidatedValues++; });
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    if (peakRssBytes > AI_PROTOCOL.maxRssBytes || performance.now() - started > 60000) throw Error('QUALITY_BUILD_BUDGET');
    return { ...row, ...profile };
  });
  const dataset = { version: 2, featureSchemaVersion: 2, kind: 'QUALITY_RECONSTRUCTION_ONLY', trainingAllowed: false,
    independentHoldout: false, activation: false, parentDatasetHash: hash(text),
    qualityPolicy: AI_FEATURE_QUALITY_POLICY, qualityPolicyHash: hash(JSON.stringify(AI_FEATURE_QUALITY_POLICY)),
    featureNames: AI_FEATURE_NAMES, featureGroups: AI_FEATURE_GROUPS,
    sources: source.sources, codeHashes: ['lib/picks/aiFeatureQuality.ts', 'lib/picks/aiFeatures.ts', 'scripts/buildAIQualityDataset.ts'].map(file => ({ file, hash: hash(readFileSync(file, 'utf8')) })),
    rows, summary: { rows: rows.length, modes, warningRows: reasons, availableCoverage: availableSum / rows.length, freshCoverage: freshSum / rows.length, invalidatedValues },
    limitations: [...source.limitations, 'Quality rebuild only, not a new independent holdout or accepted training protocol.',
      'Freshness is based on historical match time, not verified provider publication time.',
      'Advanced exponentially weighted aggregates may retain older history; readiness checks do not claim all contributing data is current-season.'] };
  const raw = JSON.stringify(dataset); if (Buffer.byteLength(raw) > AI_PROTOCOL.maxCacheBytes / 2) throw Error('QUALITY_DATASET_BUDGET');
  const dir = resolve('.runtime/ai-quality-v2'); mkdirSync(dir, { recursive: true });
  if (dir !== realpathSync(dir)) throw Error('UNSAFE_OUTPUT_PATH');
  const path = resolve(dir, `${hash(raw)}.dataset.json`);
  if (existsSync(path)) { if (readFileSync(path, 'utf8') !== raw) throw Error('IMMUTABLE_DATASET_COLLISION'); }
  else writeFileSync(path, raw, { flag: 'wx' });
  profileTimes.sort((a, b) => a - b);
  console.log(JSON.stringify({ path, ...dataset.summary, bytes: Buffer.byteLength(raw), seconds: (performance.now() - started) / 1000,
    profileP95Ms: profileTimes[Math.ceil(profileTimes.length * .95) - 1], peakRssBytes,
    databaseQueries: 0, providerCalls: 0, trainingAllowed: false }, null, 2));
}
main();
