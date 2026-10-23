/** Local, metadata-only preflight. Does not fit models, open DB connections or inspect new targets. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { profileReadiness, checkExperimentWindow, type AIReadinessRow } from '../lib/picks/aiExperimentReadiness';

const datasetPath = '.runtime/ai-quality-v2/cabca0a635219d7d1eba6984116e9c79b12461e764545e2e44d9a12edb529861.dataset.json';
const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');
const started = performance.now();
let readBytes = 0;
function readBounded(file: string) {
  const path = resolve(file);
  if (realpathSync(path) !== path) throw Error('UNSAFE_PREFLIGHT_PATH');
  const size = statSync(path).size;
  if (size > 32 * 1024 ** 2 || readBytes + size > 64 * 1024 ** 2) throw Error('PREFLIGHT_READ_BUDGET');
  readBytes += size;
  return readFileSync(path, 'utf8');
}
function main() {
  if (process.argv.length > 2) throw Error('PREFLIGHT_HAS_NO_TUNING_ARGUMENTS');
  const raw = readBounded(datasetPath);
  if (!datasetPath.endsWith(`${sha(raw)}.dataset.json`)) throw Error('PREFLIGHT_DATASET_HASH');
  const dataset = JSON.parse(raw) as { version: number; trainingAllowed: boolean; rows: AIReadinessRow[];
    sources: { file: string; hash: string }[] };
  if (dataset.version !== 2 || dataset.trainingAllowed !== false) throw Error('PREFLIGHT_DATASET_CONTRACT');
  const sources = new Map<string, string>();
  for (const s of dataset.sources) {
    if (!/^\.cache\/(season-inventories\/2026-09-20-\d+-\d+|backtest\/stats-\d+-\d+)\.json$/.test(s.file)) throw Error('PREFLIGHT_SOURCE_PATH');
    const content = readBounded(s.file);
    if (sha(content) !== s.hash) throw Error('PREFLIGHT_CHANGED_SOURCE');
    sources.set(s.file, content);
  }
  const readiness = profileReadiness(dataset.rows);
  const inventories = [...sources].filter(([file]) => file.includes('/season-inventories/')).map(([file, content]) => {
    const inventory = JSON.parse(content) as { leagueId: number; season: number; fetchedAt: string;
      fixtures: { fixtureId: number; kickoff: string; status: string }[] };
    const ft = inventory.fixtures.filter(f => f.status === 'FT');
    const statsPath = `.cache/backtest/stats-${inventory.leagueId}-${inventory.season}.json`;
    // Only verified parent sources may contribute. New files require explicit review/new dataset.
    const stats = sources.has(statsPath) ? JSON.parse(sources.get(statsPath)!) as Record<string, unknown> : null;
    return { file, leagueId: inventory.leagueId, season: inventory.season, fetchedAt: inventory.fetchedAt,
      finished: ft.length, latestFinished: ft.map(f => f.kickoff).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null,
      statsInParent: !!stats, finishedWithStatRecord: stats ? ft.filter(f => Object.hasOwn(stats, String(f.fixtureId))).length : 0 };
  });
  const inventoryFiles = readdirSync('.cache/season-inventories').filter(f => /^\d{4}-\d{2}-\d{2}-\d+-\d+\.json$/.test(f)).sort();
  const statFiles = readdirSync('.cache/backtest').filter(f => /^stats-\d+-\d+\.json$/.test(f)).sort();
  const report = { version: 1, kind: 'AI_NEXT_EXPERIMENT_PREFLIGHT', datasetHash: sha(raw),
    scope: 'Pinned quality dataset and parent sources; file names only for other local inventory/stat files. No production read.',
    readiness, inventories, localFiles: { inventoryFiles, statFiles },
    protocolWindow: checkExperimentWindow(null), trainingAllowed: false, activationAllowed: false,
    blockers: ['PROTOCOL_NOT_LOCKED', 'NO_NEW_INDEPENDENT_EVALUATION_DATA', 'SOURCE_PUBLICATION_TIMES_UNVERIFIED', 'NEUTRAL_VENUES_UNVERIFIED'],
    databaseQueries: 0, providerCalls: 0,
    codeHashes: ['scripts/checkAIExperimentReadiness.ts', 'lib/picks/aiExperimentReadiness.ts'].map(file => ({ file, hash: sha(readFileSync(file, 'utf8')) })) };
  const result = JSON.stringify(report, null, 2);
  if (Buffer.byteLength(result) > 250000 || performance.now() - started > 30000) throw Error('PREFLIGHT_OUTPUT_BUDGET');
  const dir = resolve('.runtime/ai-quality-v2'); mkdirSync(dir, { recursive: true });
  if (realpathSync(dir) !== dir) throw Error('UNSAFE_PREFLIGHT_OUTPUT');
  const path = resolve(dir, `${sha(result)}.preflight.json`);
  if (existsSync(path)) { if (readFileSync(path, 'utf8') !== result) throw Error('PREFLIGHT_COLLISION'); }
  else writeFileSync(path, result, { flag: 'wx' });
  console.log(JSON.stringify({ path, readiness, blockers: report.blockers,
    missingStats: inventories.filter(i => !i.statsInParent).map(i => ({ league: i.leagueId, season: i.season, finished: i.finished })),
    localStatFiles: statFiles, readBytes, elapsedMs: performance.now() - started,
    databaseQueries: 0, providerCalls: 0 }, null, 2));
}
main();
