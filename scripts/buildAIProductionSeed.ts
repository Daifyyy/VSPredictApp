/** One-time, local-only seed. Base goal features need no shooting/provider data. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { AIFreshFeatureBuilder } from '../lib/picks/aiFeatureQuality';
import { classifyCompetitionRound } from '../lib/stats/seasonPhases';
import type { SeasonInventory } from '../lib/stats/seasonInventory';
import type { AIMatch } from '../lib/picks/aiResearch';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rows: AIMatch[] = [], sources: Array<{ path: string; hash: string }> = [];
const leagues = [39, 61, 78, 135, 140];
const schedule: Array<{ fixtureId: number; leagueId: number; homeId: number; awayId: number; kickoff: string }> = [];
for (const leagueId of leagues) for (const season of [2024, 2025, 2026]) {
  const path = season === 2024 ? `.runtime/ai-inventory-2024-v1/2024-${leagueId}.json` : `.cache/season-inventories/2026-09-20-${leagueId}-${season}.json`;
  const raw = readFileSync(path, 'utf8'), data: SeasonInventory = JSON.parse(raw);
  if (data.leagueId !== leagueId || data.season !== season || data.version !== 1 || data.pagination.total !== 1 || data.pagination.current !== 1
    || data.count !== data.fixtures.length || sha(JSON.stringify(data.fixtures)) !== data.sha256) throw Error('INVALID_SEED_INVENTORY');
  sources.push({ path, hash: sha(raw) });
  for (const f of data.fixtures) {
    if (classifyCompetitionRound(f.round) !== 'REGULAR_SEASON') continue;
    if (season === 2026) { schedule.push({ fixtureId: f.fixtureId, leagueId, homeId: f.homeTeamId, awayId: f.awayTeamId, kickoff: f.kickoff }); continue; }
    if (['AWD', 'WO', 'CANC', 'ABD'].includes(f.status)) continue; // Not a played FT target, same exclusion as training.
    if (f.status !== 'FT' || f.homeGoals == null || f.awayGoals == null) throw Error('INCOMPLETE_HISTORICAL_SEASON');
    rows.push({ fixtureId: f.fixtureId, leagueId, season, date: f.kickoff, homeId: f.homeTeamId, awayId: f.awayTeamId, homeGoals: f.homeGoals, awayGoals: f.awayGoals });
  }
}
rows.sort((a, b) => a.date.localeCompare(b.date) || a.fixtureId - b.fixtureId);
const builder = new AIFreshFeatureBuilder();
for (const r of rows) builder.ingest(r);
const checkpoint = builder.checkpoint();
// BASE never consumes rolling shot/venue features. Retain quality windows only once.
for (const [, profile] of checkpoint.legacy.profiles) profile.queue = [];
const seed = { version: 1, mode: 'BASE_ONLY', season: 2026, historyStartSeason: 2024, leagues, sources,
  latestHistory: rows.at(-1)!.date, matches: rows.length, checkpoint, schedule };
const raw = JSON.stringify(seed);
if (Buffer.byteLength(raw) > 1_000_000) throw Error('SEED_TOO_LARGE');
const dir = '.runtime/ai-base-research-export-v1'; mkdirSync(dir, { recursive: true });
const out = `${dir}/history-seed.json`;
if (existsSync(out) && readFileSync(out, 'utf8') !== raw) throw Error('SEED_ALREADY_EXISTS');
if (!existsSync(out)) writeFileSync(out, raw, { flag: 'wx' });
const packed = `${dir}/history-seed.packed.json`;
if (!existsSync(packed)) writeFileSync(packed, JSON.stringify({ sha256: sha(raw), bytes: Buffer.byteLength(raw), gzip: gzipSync(raw).toString('base64') }), { flag: 'wx' });
console.log(JSON.stringify({ status: 'SEED_BUILT', matches: rows.length, bytes: Buffer.byteLength(raw), sha: sha(raw), schedule: schedule.length, latestHistory: seed.latestHistory }));
