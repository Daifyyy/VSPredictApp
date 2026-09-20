import type { SeasonResult } from "./seasonResults";

export type CompetitionPhase = "REGULAR_SEASON" | "CHAMPIONSHIP_STAGE" | "RELEGATION_STAGE" | "EUROPEAN_STAGE" |
  "PLAYOFF" | "UNKNOWN";
export function classifyCompetitionRound(round: string | null | undefined): CompetitionPhase {
  const value = round?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  if (/^regular season(?: - \d+)?$/.test(value)) return "REGULAR_SEASON";
  if (/^(championship round|championship group|championship)(?: - \d+)?$/.test(value)) return "CHAMPIONSHIP_STAGE";
  if (/^(relegation round|relegation group)(?: - \d+)?$/.test(value)) return "RELEGATION_STAGE";
  if (/^(conference league group|europa league group)(?: - \d+)?$/.test(value)) return "EUROPEAN_STAGE";
  if (/^relegation - (final|semi-finals?)(?: - \d+)?$/.test(value)) return "PLAYOFF";
  if (/play[ -]?offs?/.test(value) || /^(final|semi-finals?|quarter-finals?)(?: - \d+)?$/.test(value)) return "PLAYOFF";
  return "UNKNOWN";
}

const record = (v: unknown): Record<string, unknown> | null =>
  v != null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
export interface PhaseEvidence {
  round: string;
  phase: CompetitionPhase;
  sources: string[];
}
export interface CompetitionMetadata {
  version: 1;
  fixtureId: number;
  leagueId: number;
  season: number;
  kickoff: string;
  homeTeamId: number;
  awayTeamId: number;
  round: string | null;
}
/** Retains only round/provenance, not full fixture payloads. Never infers a missing round. */
export class SeasonPhaseIndex {
  private matches: Map<number, SeasonResult>;
  private evidence = new Map<number, Map<string, PhaseEvidence>>();
  rejectedIdentity = 0;
  constructor(matches: SeasonResult[]) { this.matches = new Map(matches.map(r => [r.fixtureId, r])); }

  addPredictionSnapshot(snapshot: unknown, source: string) {
    const competition = record(record(snapshot)?.competition);
    if (competition?.version !== 1) return;
    this.addFixturePayload([{
      fixture: { id: competition.fixtureId, date: competition.kickoff },
      league: { id: competition.leagueId, season: competition.season, round: competition.round },
      teams: { home: { id: competition.homeTeamId }, away: { id: competition.awayTeamId } },
    }], source);
  }

  addFixturePayload(payload: unknown, source: string) {
    if (!Array.isArray(payload)) return;
    for (const value of payload) {
      const row = record(value), fixture = record(row?.fixture), league = record(row?.league);
      const teams = record(row?.teams), home = record(teams?.home), away = record(teams?.away);
      const match = this.matches.get(fixture?.id as number);
      if (!match || typeof league?.round !== "string" || !league.round.trim()) continue;
      if (league.id !== match.leagueId || league.season !== match.season ||
          home?.id !== match.homeTeamId || away?.id !== match.awayTeamId ||
          typeof fixture?.date !== "string" || Date.parse(fixture.date) !== match.kickoff.getTime()) {
        this.rejectedIdentity++; continue;
      }
      this.addRound(match.fixtureId, league.round, source);
    }
  }

  addRound(fixtureId: number, round: string, source: string) {
    if (!this.matches.has(fixtureId) || !round.trim()) return;
    const key = round.trim().toLowerCase().replace(/\s+/g, " ");
    const rounds = this.evidence.get(fixtureId) ?? new Map<string, PhaseEvidence>();
    const evidence = rounds.get(key) ?? { round: round.trim(), phase: classifyCompetitionRound(round), sources: [] };
    if (!evidence.sources.includes(source) && evidence.sources.length < 3) evidence.sources.push(source);
    rounds.set(key, evidence);
    this.evidence.set(fixtureId, rounds);
  }

  get(fixtureId: number) {
    const evidence = [...(this.evidence.get(fixtureId)?.values() ?? [])];
    // Even two different regular rounds are a discrepancy worth auditing.
    const status = evidence.length > 1 ? "CONFLICT" : evidence.length === 0 ? "MISSING" :
      evidence[0].phase === "UNKNOWN" ? "UNRECOGNIZED" : "RESOLVED";
    return { status, phase: status === "RESOLVED" ? evidence[0].phase : "UNKNOWN" as CompetitionPhase, evidence };
  }
}

/** Baseline scope v1: regular season only; later stages are reported separately. */
export function summarizeSeasonPhases(matches: SeasonResult[], index: SeasonPhaseIndex, leagueId: number, season: number) {
  const rows = matches.filter(r => r.leagueId === leagueId && r.season === season);
  const counts: Record<CompetitionPhase, number> = {
    REGULAR_SEASON: 0, CHAMPIONSHIP_STAGE: 0, RELEGATION_STAGE: 0, EUROPEAN_STAGE: 0, PLAYOFF: 0, UNKNOWN: 0,
  };
  const unresolved: number[] = [];
  const issues: Array<{fixtureId: number; status: string; evidence: PhaseEvidence[]}> = [];
  let resolved = 0;
  for (const row of rows) {
    const phase = index.get(row.fixtureId);
    counts[phase.phase]++;
    if (phase.status === "RESOLVED") resolved++; else {
      unresolved.push(row.fixtureId);
      issues.push({ fixtureId: row.fixtureId, status: phase.status, evidence: phase.evidence });
    }
  }
  return { leagueId, season, observedResults: rows.length, resolved, counts,
    phaseCoverage: rows.length ? resolved / rows.length : null, unresolved, issues,
    // Daily, recent-N and team caches do not prove an exhaustive season inventory.
    inventoryCoverage: "UNVERIFIED" as const, productionEligible: false as const };
}
