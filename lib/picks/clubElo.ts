export const CLUB_ELO_MODEL_VERSION = 1;

export type EloConfig = {
  initial: number; longK: number; fastK: number; homeAdvantage: number;
  seasonRegression: number; fastHalfLifeDays: number; goalDifferenceWeight: number;
  longBlend: number;
};

export const DEFAULT_ELO_CONFIG: EloConfig = {
  initial: 1500, longK: 25, fastK: 50, homeAdvantage: 70,
  seasonRegression: .10, fastHalfLifeDays: 120, goalDifferenceWeight: .50, longBlend: .65,
};

export type EloMatch = { fixtureId: number; leagueId: number; season: number; kickoff: Date; homeTeamId: number; awayTeamId: number; homeGoals: number; awayGoals: number; neutral?: boolean; context?: string };
export type EloTeamState = { teamId: number; leagueId: number; season: number; long: number; fast: number; longSample: number; fastSample: number; lastMatchAt: Date | null };
export type EloProbabilities = { home: number; draw: number; away: number };
export type EloSnapshot = { fixtureId: number; home: EloTeamState; away: EloTeamState; blended: EloProbabilities; long: EloProbabilities; fast: EloProbabilities };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const expectation = (difference: number) => 1 / (1 + 10 ** (-difference / 400));

export function eloProbabilities(homeRating: number, awayRating: number, homeAdvantage: number): EloProbabilities {
  const difference = homeRating + homeAdvantage - awayRating;
  const decisiveHome = expectation(difference);
  const draw = clamp(.28 - Math.abs(difference) / 2400, .16, .28);
  return { home: decisiveHome * (1 - draw), draw, away: (1 - decisiveHome) * (1 - draw) };
}

function decay(value: number, target: number, elapsedDays: number, halfLife: number) {
  return target + (value - target) * 2 ** (-Math.max(0, elapsedDays) / halfLife);
}

function beforeMatch(state: EloTeamState, match: EloMatch, config: EloConfig, leagueMean: number): EloTeamState {
  let long = state.long;
  if (state.season !== match.season) long += (leagueMean - long) * config.seasonRegression;
  const days = state.lastMatchAt ? (match.kickoff.getTime() - state.lastMatchAt.getTime()) / 86_400_000 : 0;
  return { ...state, leagueId: match.context === "EURO_CUP" && state.longSample > 0 ? state.leagueId : match.leagueId, season: match.season, long, fast: decay(state.fast, leagueMean, days, config.fastHalfLifeDays), fastSample: decay(state.fastSample, 0, days, config.fastHalfLifeDays) };
}

export function replayElo(matches: EloMatch[], config = DEFAULT_ELO_CONFIG) {
  const states = new Map<number, EloTeamState>();
  const snapshots: EloSnapshot[] = [];
  const ordered = [...matches].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime() || a.fixtureId - b.fixtureId);
  for (const match of ordered) {
    const league = [...states.values()].filter((s) => s.leagueId === match.leagueId);
    const leagueMean = league.length ? league.reduce((sum, s) => sum + s.long, 0) / league.length : config.initial;
    const fresh = (teamId: number): EloTeamState => ({ teamId, leagueId: match.leagueId, season: match.season, long: leagueMean, fast: leagueMean, longSample: 0, fastSample: 0, lastMatchAt: null });
    const home = beforeMatch(states.get(match.homeTeamId) ?? fresh(match.homeTeamId), match, config, leagueMean);
    const away = beforeMatch(states.get(match.awayTeamId) ?? fresh(match.awayTeamId), match, config, leagueMean);
    const advantage = match.neutral ? 0 : config.homeAdvantage;
    const long = eloProbabilities(home.long, away.long, advantage);
    const fast = eloProbabilities(home.fast, away.fast, advantage);
    const blended = { home: config.longBlend * long.home + (1 - config.longBlend) * fast.home, draw: config.longBlend * long.draw + (1 - config.longBlend) * fast.draw, away: config.longBlend * long.away + (1 - config.longBlend) * fast.away };
    snapshots.push({ fixtureId: match.fixtureId, home: { ...home }, away: { ...away }, long, fast, blended });
    const actual = match.homeGoals > match.awayGoals ? 1 : match.homeGoals < match.awayGoals ? 0 : .5;
    const expected = expectation(home.long + advantage - away.long);
    const multiplier = 1 + config.goalDifferenceWeight * Math.log1p(Math.abs(match.homeGoals - match.awayGoals));
    const longDelta = config.longK * multiplier * (actual - expected);
    const fastExpected = expectation(home.fast + advantage - away.fast);
    const fastDelta = config.fastK * multiplier * (actual - fastExpected);
    states.set(home.teamId, { ...home, long: home.long + longDelta, fast: home.fast + fastDelta, longSample: home.longSample + 1, fastSample: home.fastSample + 1, lastMatchAt: match.kickoff });
    states.set(away.teamId, { ...away, long: away.long - longDelta, fast: away.fast - fastDelta, longSample: away.longSample + 1, fastSample: away.fastSample + 1, lastMatchAt: match.kickoff });
  }
  return { states, snapshots };
}

export function eloMetrics(predictions: Array<{ probabilities: EloProbabilities; result: "HOME" | "DRAW" | "AWAY" }>) {
  if (!predictions.length) return { logLoss: 0, brier: 0, ece: 0 };
  let logLoss = 0, brier = 0;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, confidence: 0, correct: 0 }));
  for (const row of predictions) {
    const key = row.result === "HOME" ? "home" : row.result === "DRAW" ? "draw" : "away";
    logLoss -= Math.log(Math.max(1e-9, row.probabilities[key]));
    brier += (["home", "draw", "away"] as const).reduce((sum, side) => sum + (row.probabilities[side] - (side === key ? 1 : 0)) ** 2, 0);
    const entries = Object.entries(row.probabilities) as Array<[keyof EloProbabilities, number]>;
    const pick = entries.sort((a, b) => b[1] - a[1])[0];
    const bin = bins[Math.min(9, Math.floor(pick[1] * 10))]; bin.n++; bin.confidence += pick[1]; bin.correct += pick[0] === key ? 1 : 0;
  }
  const ece = bins.reduce((sum, b) => sum + (b.n ? b.n / predictions.length * Math.abs(b.correct / b.n - b.confidence / b.n) : 0), 0);
  return { logLoss: logLoss / predictions.length, brier: brier / predictions.length, ece };
}
