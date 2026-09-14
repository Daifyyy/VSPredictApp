export const ODDS_MAX_ATTEMPTS_PER_FIXTURE = 3;

export function allowedOddsFixtures(input: { requested: number; globalRemaining: number; oddsRemaining: number }) {
  return Math.max(0, Math.min(input.requested, input.globalRemaining, Math.floor(input.oddsRemaining / ODDS_MAX_ATTEMPTS_PER_FIXTURE)));
}

export function priorityOrder<T extends { fixtureId: number; kickoff: Date }>(rows: T[], p0: ReadonlySet<number>) {
  return [...rows].sort((a, b) => Number(!p0.has(a.fixtureId)) - Number(!p0.has(b.fixtureId)) || a.kickoff.getTime() - b.kickoff.getTime());
}
