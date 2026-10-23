/** Explicit local files only. No env-file, DB/provider imports, refresh, or activation. */
import { readFileSync, realpathSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildResearchFeatures, researchDaySplit, runOneXTwoResearch, type ResearchMatch } from "../lib/picks/oneXTwoResearch";
import type { BenchmarkRow } from "../lib/picks/forecastBenchmark";
import type { SeasonInventory } from "../lib/stats/seasonInventory";
import { classifyCompetitionRound } from "../lib/stats/seasonPhases";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = ".runtime/goal-benchmark/2026-10-18T13-05-25.353Z.json";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const hash = (x: unknown) => sha(JSON.stringify(x));
function readLocal(file: string) {
  const actual = realpathSync(resolve(root, file)), rel = relative(realpathSync(root), actual);
  if (rel.startsWith("..") || isAbsolute(rel)) throw Error(`INPUT_OUTSIDE_WORKSPACE: ${file}`);
  return readFileSync(actual, "utf8");
}
function immutableWrite(file: string, contents: string) {
  try { writeFileSync(file, contents, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" || readFileSync(file, "utf8") !== contents) throw error;
  }
}
function main() {
  if (process.argv.length > 2) throw Error("No dynamic input paths or tuning flags. This protocol uses one pinned benchmark and its referenced inventories.");
  const started = performance.now(), raw = readLocal(sourceFile);
  const source = JSON.parse(raw) as {
    kind: string; cutoff: string; sourceHash: string; forecastHash: string; datasetHash: string;
    sources: Array<{ file: string; hash: string }>; rows: BenchmarkRow[]; excluded: Record<string, number>;
  };
  if (source.kind !== "GOALS_ONLY_RECONSTRUCTION" || source.cutoff !== "2026-09-20" || !Array.isArray(source.rows) ||
      !Array.isArray(source.sources) || !source.sources.length || hash(source.rows) !== source.forecastHash || hash(source.sources) !== source.sourceHash) throw Error("SOURCE_PROVENANCE_MISMATCH");
  const history: ResearchMatch[] = [], inputFiles: Array<{ file: string; sha256: string; canonicalHash: string }> = [];
  const seenFixtures = new Set<number>(), seenSources = new Set<string>();
  const excluded: Record<string, number> = {};
  const reject = (reason: string) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  for (const entry of source.sources) {
    const match = /^\.cache\/season-inventories\/2026-09-20-(\d+)-(2025|2026)\.json$/.exec(entry.file);
    if (!match || seenSources.has(entry.file)) throw Error("INVALID_OR_DUPLICATE_SOURCE_REFERENCE");
    seenSources.add(entry.file);
    const inventoryRaw = readLocal(entry.file), inventory = JSON.parse(inventoryRaw) as SeasonInventory;
    if (inventory.version !== 1 || inventory.leagueId !== Number(match[1]) || inventory.season !== Number(match[2]) ||
        !Array.isArray(inventory.fixtures) || inventory.count !== inventory.fixtures.length || inventory.pagination.current !== 1 ||
        inventory.pagination.total !== 1 || hash(inventory) !== entry.hash || hash(inventory.fixtures) !== inventory.sha256 ||
        !Number.isFinite(Date.parse(inventory.fetchedAt))) throw Error(`INVALID_INVENTORY: ${entry.file}`);
    inputFiles.push({ file: entry.file, sha256: sha(inventoryRaw), canonicalHash: hash(inventory) });
    for (const f of inventory.fixtures) {
      if (!Number.isInteger(f.fixtureId) || f.fixtureId <= 0 || seenFixtures.has(f.fixtureId)) throw Error("INVALID_OR_DUPLICATE_INVENTORY_FIXTURE");
      seenFixtures.add(f.fixtureId);
      if (!Number.isFinite(Date.parse(f.kickoff))) throw Error("INVALID_INVENTORY_DATE");
      if (f.status !== "FT") { reject("NOT_FT"); continue; }
      if (classifyCompetitionRound(f.round) !== "REGULAR_SEASON") { reject("NOT_REGULAR_SEASON"); continue; }
      if (Date.parse(f.kickoff) + 3 * 3600000 >= Date.parse(source.cutoff)) { reject("AFTER_CUTOFF_OR_COMPLETION_MARGIN"); continue; }
      if (f.homeGoals === null || f.awayGoals === null) throw Error("MISSING_FINISHED_RESULT");
      history.push({ fixtureId: f.fixtureId, leagueId: inventory.leagueId, date: new Date(f.kickoff).toISOString(),
        homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId, homeGoals: f.homeGoals, awayGoals: f.awayGoals });
    }
  }
  history.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.fixtureId - b.fixtureId);
  const report = runOneXTwoResearch(source.rows, history);
  const features = buildResearchFeatures(source.rows, history), split = researchDaySplit(features);
  const provenance = { sourceFile, sourceSha256: sha(raw), forecastHash: source.forecastHash,
    upstreamDatasetHash: source.datasetHash, inputFiles, historyHash: hash(history), featureHash: hash(features),
    trainingHash: hash(split.train), validationHash: hash(split.validation), terminalHash: hash(split.terminal),
    engineSha256: sha(readLocal("lib/picks/oneXTwoResearch.ts")), runnerSha256: sha(readLocal("scripts/runOneXTwoResearch.ts")) };
  const artifact = {
    kind: "OFFLINE_1X2_RESEARCH_CANDIDATE", version: 1, activation: report.protocol.activation,
    productionEligible: false, protocol: report.protocol, status: report.status, model: report.selectedModel,
    provenance: { sourceSha256: provenance.sourceSha256, inputsHash: hash(inputFiles), historyHash: provenance.historyHash,
      trainingHash: provenance.trainingHash, validationHash: provenance.validationHash,
      engineSha256: provenance.engineSha256, runnerSha256: provenance.runnerSha256 },
    partitions: report.partitions, selection: { partition: "validation", objective: "multiclass log loss",
      minimumGain: report.protocol.minimumValidationGain, metrics: report.validation.map(v => ({ ablation: v.ablation, n: v.metrics.n, logLoss: v.metrics.logLoss })) },
    featureContract: { version: 1, base: "stabilized100", day: "UTC", completionMarginHours: 3,
      scaling: "Fixed constants in hashed engine, no dataset-wide normalization", missing: "Finite defaults plus explicit missingness flags",
      unsupported: ["live activation", "neutral fixtures", "other competition contexts", "joint goal distribution", "price or profitability claims"] },
    warning: "Previously explored terminal period. Research only; never import into production inference or train on request.",
  };
  const artifactText = JSON.stringify(artifact, null, 2) + "\n";
  if (Buffer.byteLength(artifactText) > 16384) throw Error("CANDIDATE_ARTIFACT_TOO_LARGE");
  const output = resolve(root, ".runtime/one-x-two-research");
  mkdirSync(output, { recursive: true });
  if (realpathSync(output) !== output) throw Error("OUTPUT_DIRECTORY_MUST_NOT_BE_SYMLINKED");
  const runId = hash({ provenance, protocol: report.protocol });
  const reportPath = resolve(output, `${runId}.report.json`), artifactPath = resolve(output, `${runId}.candidate.json`);
  // Existing files are never overwritten; identical runs are idempotent. No live registry writes.
  if (existsSync(reportPath) && realpathSync(reportPath) !== reportPath) throw Error("SYMLINKED_REPORT");
  if (existsSync(artifactPath) && realpathSync(artifactPath) !== artifactPath) throw Error("SYMLINKED_CANDIDATE");
  immutableWrite(reportPath, JSON.stringify({ ...report, provenance, inputCoverage: { inventoryFixtures: seenFixtures.size,
    eligibleHistory: history.length, excludedInventory: excluded, upstreamBenchmarkExclusions: source.excluded } }, null, 2) + "\n");
  immutableWrite(artifactPath, artifactText);
  console.log(JSON.stringify({ reportPath, artifactPath, artifactSha256: sha(artifactText), status: report.status,
    selected: report.selectedModel.ablation, partitions: report.partitions,
    validation: artifact.selection.metrics, terminal: Object.fromEntries(Object.entries(report.terminal).map(([k, v]) => [k, { n: v.n, logLoss: v.logLoss, brier: v.brier, rps: v.rps }])),
    pairedTerminal: report.pairedTerminal, runtime: { seconds: (performance.now() - started) / 1000, databaseQueries: 0, providerCalls: 0 } }, null, 2));
}
try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
