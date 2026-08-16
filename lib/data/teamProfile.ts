import type { Injury, LeagueGoalsAvg, Scorer, Standing, Transfer } from "@/lib/types";
import { buildTeamProfileCore, type TeamProfileCore } from "@/lib/teamProfile";
import { getCompareTeam, getInjuries, getOpponentMatchStats, getStanding, getTopScorers, getTransfers } from "./repository";
import { getTeamTacticalProfile } from "./tactics";
import type { TacticalProfile } from "@/lib/tactics";

export interface TeamProfileData extends TeamProfileCore {
  standing: Standing | null;
  leagueAvg: LeagueGoalsAvg | null;
  scorers: Scorer[];
  injuries: Injury[] | null;
  transfers: Transfer[];
  tactics: TacticalProfile;
  availability: {
    standing: boolean;
    scorers: boolean;
    injuries: boolean;
    transfers: boolean;
  };
}

export async function loadTeamProfile(
  teamId: number,
  leagueId: number,
  includePro: boolean
): Promise<TeamProfileData | null> {
  const team = await getCompareTeam(teamId, leagueId, false);
  if (!team) return null;

  const core = buildTeamProfileCore(team);
  const recentFixtureIds = [...new Set(core.formQuality.flatMap((item) => item.matches.map((match) => match.fixtureId)))];

  const [standingResult, scorersResult, injuriesResult, transfersResult, opponentStatsResult, tacticsResult] = await Promise.allSettled([
    getStanding(teamId, leagueId),
    getTopScorers(teamId, leagueId),
    includePro ? getInjuries(teamId, leagueId) : Promise.resolve(null),
    getTransfers([leagueId], 200),
    getOpponentMatchStats(teamId, recentFixtureIds),
    getTeamTacticalProfile(teamId),
  ]);
  const standing = standingResult.status === "fulfilled" ? standingResult.value : null;
  const transfers = transfersResult.status === "fulfilled"
    ? transfersResult.value.filter((item) => item.inTeamId === teamId || item.outTeamId === teamId)
    : [];

  const opponentStats = opponentStatsResult.status === "fulfilled" ? opponentStatsResult.value : new Map();
  const formQuality = core.formQuality.map((quality) => ({
    ...quality,
    matches: quality.matches.map((match) => {
      const opponent = opponentStats.get(match.fixtureId);
      return {
        ...match,
        opponentStats: opponent ? {
          shots: opponent.metrics.SHOTS ?? null,
          shotsOnTarget: opponent.metrics.SHOTS_ON_TARGET ?? null,
          possession: opponent.metrics.POSSESSION ?? null,
          corners: opponent.metrics.CORNERS ?? null,
          cards: opponent.metrics.YELLOW_CARDS == null
            ? null
            : opponent.metrics.YELLOW_CARDS + (opponent.metrics.RED_CARDS ?? 0),
        } : null,
      };
    }),
  }));

  return {
    ...core,
    formQuality,
    standing: standing?.standing ?? null,
    leagueAvg: standing?.leagueAvg ?? null,
    scorers: scorersResult.status === "fulfilled" ? scorersResult.value : [],
    injuries: injuriesResult.status === "fulfilled" ? injuriesResult.value : null,
    transfers,
    tactics: tacticsResult.status === "fulfilled" ? tacticsResult.value : {
      sampleSize: 0, primaryFormation: null, formations: [], homeFormation: null, awayFormation: null,
      stability: null, defensiveLine: null, recentChange: false, coach: null, matches: [],
    },
    availability: {
      standing: standingResult.status === "fulfilled",
      scorers: scorersResult.status === "fulfilled",
      injuries: includePro && injuriesResult.status === "fulfilled",
      transfers: transfersResult.status === "fulfilled",
    },
  };
}
