import type { PedigreeSignal } from "./intuitionTickets";

export type PedigreeState = { teamId: number; leagueId: number; longRating: number; longSample: number };
export type PedigreeMatch = { season: number; context: string; homeTeamId: number; awayTeamId: number };
export type PedigreeResult = PedigreeSignal & { teamId: number; leagueId: number; longRating: number; longSample: number };

export function buildPedigree(states: PedigreeState[], matches: PedigreeMatch[], currentSeason: number): PedigreeResult[] {
  const seasons = new Set([currentSeason, currentSeason - 1, currentSeason - 2, currentSeason - 3]);
  const counts = new Map<number, { league: Map<number, number>; euro: number }>();
  for (const match of matches) {
    if (!seasons.has(match.season)) continue;
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      const item = counts.get(teamId) ?? { league: new Map<number, number>(), euro: 0 };
      if (match.context === "EURO_CUP") item.euro++;
      else item.league.set(match.season, (item.league.get(match.season) ?? 0) + 1);
      counts.set(teamId, item);
    }
  }
  const leagueRatings = new Map<number, number[]>();
  for (const state of states) leagueRatings.set(state.leagueId, [...(leagueRatings.get(state.leagueId) ?? []), state.longRating].sort((a, b) => a - b));
  return states.map((state) => {
    const ratings = leagueRatings.get(state.leagueId) ?? [state.longRating];
    const below = ratings.filter((rating) => rating < state.longRating).length;
    const equal = ratings.filter((rating) => rating === state.longRating).length;
    const eloPercentile = ratings.length <= 1 ? .5 : (below + Math.max(0, equal - 1) / 2) / (ratings.length - 1);
    const history = counts.get(state.teamId) ?? { league: new Map<number, number>(), euro: 0 };
    const qualifyingSeasons = [...history.league.values()].filter((count) => count >= 15).length;
    const leagueMatches = [...history.league.values()].reduce((sum, count) => sum + count, 0);
    const continuity = Math.min(1, qualifyingSeasons / 4);
    const europeanExperience = Math.min(1, history.euro / 20);
    const score = .5 * eloPercentile + .3 * continuity + .2 * europeanExperience;
    return { teamId: state.teamId, leagueId: state.leagueId, longRating: state.longRating, longSample: state.longSample, eloPercentile, continuity, europeanExperience, score, seasons: qualifyingSeasons, leagueMatches, europeanMatches: history.euro, established: score >= .60 && qualifyingSeasons >= 2 && state.longSample >= 40 };
  });
}
