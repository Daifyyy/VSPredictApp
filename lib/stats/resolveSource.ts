import type { DataSource, MatchStat, Team } from "@/lib/types";
import { euroBlendWeight, euroSample } from "./euroBlend";

const MIN_COMPETITIVE_NATIONAL = 4;

export interface ResolvedSource {
  source: DataSource;
  sourceNote?: string;
  homeMatches: MatchStat[];
  awayMatches: MatchStat[];
  blend?: {
    euroWeight: number;
    domesticWeight: number;
    effectiveEuroSample: number;
    homeEuro: MatchStat[];
    awayEuro: MatchStat[];
    home: { current: number; previous: number };
    away: { current: number; previous: number };
  };
}

/** Vybere srovnatelné datové pooly pro dvojici týmů. */
export function resolveSource(home: Team, away: Team): ResolvedSource {
  if (home.entityType === "NATIONAL" || away.entityType === "NATIONAL") {
    const competitiveCount = Math.min(
      countCompetitive(home.leagueMatches),
      countCompetitive(away.leagueMatches)
    );
    const sparse = competitiveCount < MIN_COMPETITIVE_NATIONAL;
    return {
      source: sparse ? "NATIONAL_FB" : "NATIONAL",
      sourceNote: sparse ? "Včetně přátelských zápasů" : undefined,
      homeMatches: home.leagueMatches,
      awayMatches: away.leagueMatches,
    };
  }

  const forcedEuro =
    home.competitionContext === "EURO_CUP" || away.competitionContext === "EURO_CUP";

  if (home.leagueId === away.leagueId && !forcedEuro) {
    return {
      source: "LEAGUE",
      homeMatches: home.leagueMatches,
      awayMatches: away.leagueMatches,
    };
  }

  const homeEuro = home.euroMatches ?? [];
  const awayEuro = away.euroMatches ?? [];
  const homeSample = euroSample(homeEuro);
  const awaySample = euroSample(awayEuro);
  const sharedSample = Math.min(homeSample.effective, awaySample.effective);
  const euroWeight = euroBlendWeight(sharedSample);

  if (euroWeight > 0) {
    return {
      source: "EURO_BLEND",
      sourceNote: sharedSample < 4 ? "Omezený pohárový vzorek" : undefined,
      // Forma a série jsou skutečná chronologie všech soutěžních zápasů.
      homeMatches: dedupeByFixture([...home.leagueMatches, ...homeEuro]),
      awayMatches: dedupeByFixture([...away.leagueMatches, ...awayEuro]),
      blend: {
        euroWeight,
        domesticWeight: 1 - euroWeight,
        effectiveEuroSample: sharedSample,
        homeEuro,
        awayEuro,
        home: { current: homeSample.current, previous: homeSample.previous },
        away: { current: awaySample.current, previous: awaySample.previous },
      },
    };
  }

  return {
    source: "FALLBACK",
    sourceNote: "Data z domácí ligy",
    homeMatches: home.leagueMatches,
    awayMatches: away.leagueMatches,
  };
}

function dedupeByFixture(matches: MatchStat[]): MatchStat[] {
  return [...new Map(matches.map((match) => [match.fixtureId, match])).values()];
}

function countCompetitive(matches: MatchStat[]): number {
  return matches.filter((match) => match.competitive).length;
}
