/** Explicit offline audit: bounded local reads, no database, no provider, no model fitting. */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, realpathSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconcileAIArchive, type AIArchiveRow } from '../lib/picks/aiLocalArchive';
import type { SeasonInventory } from '../lib/stats/seasonInventory';

const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');
let bytes = 0;
const sources: { file: string; hash: string }[] = [];
function read(file: string) {
  const path = resolve(file);
  if (realpathSync(path) !== path) throw Error('UNSAFE_ARCHIVE_PATH');
  bytes += statSync(path).size;
  if (bytes > 32 * 1024 ** 2) throw Error('ARCHIVE_READ_BUDGET');
  const raw = readFileSync(path, 'utf8'); sources.push({ file, hash: sha(raw) });
  return JSON.parse(raw);
}
function main() {
  const withImport = process.argv.length === 3 && process.argv[2] === '--with-2024-import';
  if (process.argv.length > 2 && !withImport) throw Error('PINNED_ARCHIVE_SCOPE');
  const importDir = '.runtime/ai-inventory-2024-v1';
  if (withImport) {
    const manifest = read(`${importDir}/complete.json`) as { status: string; attempts: number; files: { file: string; hash: string }[] };
    if (manifest.status !== 'COMPLETE' || manifest.attempts !== 6 || manifest.files.length !== 5
      || new Set(manifest.files.map(f => f.file)).size !== 5) throw Error('INVALID_2024_IMPORT');
    for (const entry of manifest.files) {
      if (!/^2024-(39|61|78|135|140)\.json$/.test(entry.file)
        || sha(readFileSync(`${importDir}/${entry.file}`, 'utf8')) !== entry.hash) throw Error('CHANGED_2024_IMPORT');
    }
  }
  const start = performance.now();
  const results = [], fixtureScopes = new Map<number, string[]>();
  for (const leagueId of [39, 61, 78, 135, 140]) for (const season of [2024, 2025]) {
    const rows = read(`.cache/backtest/${leagueId}-${season}.json`) as AIArchiveRow[];
    const stats = read(`.cache/backtest/stats-${leagueId}-${season}.json`);
    const inventoryPath = withImport && season === 2024 ? `${importDir}/2024-${leagueId}.json`
      : `.cache/season-inventories/2026-09-20-${leagueId}-${season}.json`;
    const inventory = existsSync(inventoryPath) ? read(inventoryPath) as SeasonInventory : null;
    if (inventory && (inventory.leagueId !== leagueId || inventory.season !== season || inventory.version !== 1
      || inventory.pagination.current !== 1 || inventory.pagination.total !== 1 || inventory.count !== inventory.fixtures.length
      || inventory.sha256 !== sha(JSON.stringify(inventory.fixtures)))) throw Error('INVALID_ARCHIVE_INVENTORY');
    results.push(reconcileAIArchive(rows, stats, leagueId, season, inventory?.fixtures));
    for (const r of rows) { const scopes = fixtureScopes.get(r.fixtureId) ?? []; scopes.push(`${leagueId}/${season}`); fixtureScopes.set(r.fixtureId, scopes); }
  }
  const crossScopeDuplicates = [...fixtureScopes].filter(([, scopes]) => new Set(scopes).size > 1).map(([fixtureId, scopes]) => ({ fixtureId, scopes }));
  const report = { version: 1, kind: 'LOCAL_ARCHIVE_RECONCILIATION_ONLY', sources, results, crossScopeDuplicates,
    trainingAllowed: false, activationAllowed: false, databaseQueries: 0, providerCalls: 0,
    caveats: ['Reconciliation is not proof of historical publication time or neutral venue.',
      'Current-match statistics are labels/history only, never pre-match features for that fixture.',
      'Missing inventory cannot be replaced with assumed FT status.'],
    codeHashes: ['scripts/auditAILocalArchives.ts', 'lib/picks/aiLocalArchive.ts'].map(file => ({ file, hash: sha(readFileSync(file, 'utf8')) })) };
  const raw = JSON.stringify(report);
  if (Buffer.byteLength(raw) > 2 * 1024 ** 2 || performance.now() - start > 30000) throw Error('ARCHIVE_OUTPUT_BUDGET');
  const dir = resolve('.runtime/ai-quality-v2'); mkdirSync(dir, { recursive: true });
  if (realpathSync(dir) !== dir) throw Error('UNSAFE_ARCHIVE_OUTPUT');
  const path = resolve(dir, `${sha(raw)}.archives.json`);
  if (existsSync(path)) { if (readFileSync(path, 'utf8') !== raw) throw Error('ARCHIVE_COLLISION'); }
  else writeFileSync(path, raw, { flag: 'wx' });
  console.log(JSON.stringify({ path, results: results.map(r => Object.fromEntries(Object.entries(r).filter(([key]) => key !== 'classified'))),
    crossScopeDuplicates: crossScopeDuplicates.length, bytesRead: bytes, elapsedMs: performance.now() - start,
    databaseQueries: 0, providerCalls: 0 }, null, 2));
}
main();
