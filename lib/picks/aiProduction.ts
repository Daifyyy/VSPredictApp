import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import rawArtifact from './artifacts/baseOverResearchV1.json';
import packedSeed from './artifacts/baseOverHistoryV1.json';
import { AIFreshFeatureBuilder } from './aiFeatureQuality';
import { AI_FEATURE_NAMES, AI_FEATURE_GROUPS } from './aiFeatures';
import { inferAI, type AIModelArtifact } from './aiResearch';

import { AI_ARTIFACT_ID, AI_LEAGUES, AI_ACTIVE_SEASON } from './aiIdentity';
export { AI_ARTIFACT_ID, AI_RESEARCH_POLICY, AI_LEAGUES, AI_ACTIVE_SEASON, AI_LABEL } from './aiIdentity';
const artifact = rawArtifact as unknown as AIModelArtifact;
type Seed = { version: number; mode: string; season: number; checkpoint: ReturnType<AIFreshFeatureBuilder['checkpoint']>;
  schedule: Array<{ fixtureId: number; leagueId: number; homeId: number; awayId: number; kickoff: string }> };
let cachedSeed: Seed | null = null;
function seed() {
  if (cachedSeed) return cachedSeed;
  const raw = gunzipSync(Buffer.from(packedSeed.gzip, 'base64'), { maxOutputLength: 1_000_000 });
  if (raw.length !== packedSeed.bytes || createHash('sha256').update(raw).digest('hex') !== packedSeed.sha256) throw Error('AI_SEED_HASH_MISMATCH');
  const parsed = JSON.parse(raw.toString()) as Seed;
  if (parsed.version !== 1 || parsed.mode !== 'BASE_ONLY' || parsed.season !== AI_ACTIVE_SEASON) throw Error('AI_SEED_VERSION');
  if (JSON.stringify(artifact.featureNames) !== JSON.stringify(AI_FEATURE_NAMES)
    || artifact.selectedFeatures.some(i => AI_FEATURE_GROUPS[i] !== 1) || rawArtifact.artifactId !== AI_ARTIFACT_ID
    || rawArtifact.featureSchemaVersion !== 2 || artifact.status !== 'MANUAL_RESEARCH') throw Error('AI_ARTIFACT_SCOPE');
  cachedSeed = parsed; return parsed;
}
export type AIProductionFixture = { fixtureId: number; leagueId: number; season: number; homeTeamId: number; awayTeamId: number;
  kickoff: Date; status: string; homeGoals: number | null; awayGoals: number | null; available: boolean; modelContext: string };

/** Shared chronological builder, no fit or I/O. A missing scheduled result blocks its league, not others. */
export function buildAIBaseForecasts(history: AIProductionFixture[], targets: AIProductionFixture[], now: Date) {
  const baseline = seed(), byId = new Map(history.map(r => [r.fixtureId, r]));
  if (byId.size !== history.length) throw Error('AI_DUPLICATE_HISTORY');
  const output: Array<{ fixtureId: number; probability: number; coverage: number; homeSample: number; awaySample: number; inputHash: string; inputAudit: object }> = [];
  const rejected: Array<{ fixtureId: number; reason: string }> = [];
  const days = [...new Set(targets.map(r => r.kickoff.toISOString().slice(0, 10)))].sort();
  for (const day of days) {
    const origin = Date.parse(day), blocked = new Map<number, string>();
    for (const scheduled of baseline.schedule) {
      const current = byId.get(scheduled.fixtureId), kickoff = current?.kickoff.getTime() ?? Date.parse(scheduled.kickoff);
      if (kickoff + 10800_000 >= origin) continue;
      if (!current || current.leagueId !== scheduled.leagueId || current.homeTeamId !== scheduled.homeId || current.awayTeamId !== scheduled.awayId)
        blocked.set(scheduled.leagueId, 'INCOMPLETE_LEAGUE_HISTORY');
      else if (!['FT', 'PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(current.status) && !blocked.has(scheduled.leagueId))
        blocked.set(scheduled.leagueId, kickoff + 10800_000 >= +now ? 'WAITING_PRIOR_DAY_RESULTS' : 'UNSETTLED_HISTORY');
    }
    const builder = AIFreshFeatureBuilder.restore(baseline.checkpoint);
    const known = new Set(baseline.schedule.map(s => s.fixtureId));
    for (const r of history) if (r.status === 'FT' && +r.kickoff + 10800_000 >= +now)
      blocked.set(r.leagueId, 'IMPOSSIBLE_RESULT_TIMESTAMP');
    const completed = history.filter(r => r.season === AI_ACTIVE_SEASON && +r.kickoff + 10800_000 < Math.min(origin, +now) && r.status === 'FT').sort((a, b) => +a.kickoff - +b.kickoff || a.fixtureId - b.fixtureId);
    for (const r of completed) {
      if (!known.has(r.fixtureId) || r.homeGoals == null || r.awayGoals == null) { blocked.set(r.leagueId, 'INCOMPLETE_LEAGUE_HISTORY'); continue; }
      builder.ingest({ fixtureId: r.fixtureId, leagueId: r.leagueId, season: r.season, date: r.kickoff.toISOString(),
        homeId: r.homeTeamId, awayId: r.awayTeamId, homeGoals: r.homeGoals, awayGoals: r.awayGoals });
    }
    for (const r of targets.filter(t => t.kickoff.toISOString().startsWith(day))) {
      const fail = (reason: string) => rejected.push({ fixtureId: r.fixtureId, reason });
      const identity = baseline.schedule.find(s => s.fixtureId === r.fixtureId);
      if (identity && (identity.leagueId !== r.leagueId || identity.homeId !== r.homeTeamId || identity.awayId !== r.awayTeamId)) { fail('FIXTURE_IDENTITY_CHANGED'); continue; }
      if (!AI_LEAGUES.includes(r.leagueId) || r.season !== AI_ACTIVE_SEASON || r.modelContext !== 'LEAGUE' || !known.has(r.fixtureId)) { fail('OUT_OF_SCOPE'); continue; }
      if (r.status !== 'NS' || !r.available || +r.kickoff <= +now || day <= rawArtifact.trainingThrough) { fail('NOT_PREMATCH'); continue; }
      if (blocked.has(r.leagueId)) { fail(blocked.get(r.leagueId)!); continue; }
      const p = builder.predict({ leagueId: r.leagueId, season: r.season, homeId: r.homeTeamId, awayId: r.awayTeamId, date: r.kickoff.toISOString() });
      if (p.profileMode === 'UNAVAILABLE' || p.coreCoverage < .75) { fail('BASE_FEATURES_UNAVAILABLE'); continue; }
      const probability = inferAI(artifact, p.values, { manualResearch: true })[0];
      const inputAudit = { featureSchemaVersion: 2, sourceTiming: p.sourceTiming, seedHash: packedSeed.sha256,
        latestHistory: p.latestHistory, selectedValues: artifact.selectedFeatures.map(i => p.values[i]),
        trainingThrough: rawArtifact.trainingThrough, calibration: 'UNCALIBRATED_T1', statisticalGatePassed: false };
      output.push({ fixtureId: r.fixtureId, probability, coverage: p.coreCoverage, homeSample: p.homeSample, awaySample: p.awaySample,
        inputHash: createHash('sha256').update(JSON.stringify(inputAudit)).digest('hex'), inputAudit });
    }
  }
  return { output, rejected };
}
