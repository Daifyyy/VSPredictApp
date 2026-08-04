import type { Injury, LeagueGoalsAvg, Scorer, Standing, Transfer } from "@/lib/types";
import { buildTeamProfileCore, type TeamProfileCore } from "@/lib/teamProfile";
import { getCompareTeam, getInjuries, getStanding, getTopScorers, getTransfers } from "./repository";

export interface TeamProfileData extends TeamProfileCore {
  standing: Standing | null;
  leagueAvg: LeagueGoalsAvg | null;
  scorers: Scorer[];
  injuries: Injury[] | null;
  transfers: Transfer[];
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

  const [standingResult, scorersResult, injuriesResult, transfersResult] = await Promise.allSettled([
    getStanding(teamId, leagueId),
    getTopScorers(teamId, leagueId),
    includePro ? getInjuries(teamId, leagueId) : Promise.resolve(null),
    getTransfers([leagueId], 200),
  ]);
  const standing = standingResult.status === "fulfilled" ? standingResult.value : null;
  const transfers = transfersResult.status === "fulfilled"
    ? transfersResult.value.filter((item) => item.inTeamId === teamId || item.outTeamId === teamId)
    : [];

  return {
    ...buildTeamProfileCore(team),
    standing: standing?.standing ?? null,
    leagueAvg: standing?.leagueAvg ?? null,
    scorers: scorersResult.status === "fulfilled" ? scorersResult.value : [],
    injuries: injuriesResult.status === "fulfilled" ? injuriesResult.value : null,
    transfers,
    availability: {
      standing: standingResult.status === "fulfilled",
      scorers: scorersResult.status === "fulfilled",
      injuries: includePro && injuriesResult.status === "fulfilled",
      transfers: transfersResult.status === "fulfilled",
    },
  };
}
