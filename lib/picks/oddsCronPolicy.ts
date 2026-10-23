import type { Prisma } from "@prisma/client";

export const ODDS_MAX_ATTEMPTS_PER_FIXTURE = 3;

/** All qualified picks retain closing priority, including the restored original Over. */
export function priorityCaptureWhere(now: Date, closingOnly: boolean): Prisma.AutonomousTipSnapshotWhereInput {
  return {
    kickoff: { gt: now, lte: new Date(now.getTime() + 90 * 60_000) },
    OR: closingOnly ? [{ status: "candidate" }] : [
      { status: "candidate" },
      { strategy: { not: "OVER_25" }, status: "watch", edge: { gte: -0.02 } },
    ],
  };
}

export function closingPrioritySets(rows: Array<{ fixtureId: number; strategy: string; status: string }>, ticketIds: number[], closingOnly: boolean) {
  const p0 = new Set([...ticketIds, ...rows.filter(r => r.status === "candidate").map(r => r.fixtureId)]);
  const p1 = new Set(closingOnly ? [] : rows.filter(r => r.strategy !== "OVER_25" && !p0.has(r.fixtureId)).map(r => r.fixtureId));
  return { p0, p1 };
}

export function allowedOddsFixtures(input: { requested: number; globalRemaining: number; oddsRemaining: number }) {
  return Math.max(0, Math.min(input.requested, input.globalRemaining, Math.floor(input.oddsRemaining / ODDS_MAX_ATTEMPTS_PER_FIXTURE)));
}

export function priorityOrder<T extends { fixtureId: number; kickoff: Date }>(rows: T[], p0: ReadonlySet<number>) {
  return [...rows].sort((a, b) => Number(!p0.has(a.fixtureId)) - Number(!p0.has(b.fixtureId)) || a.kickoff.getTime() - b.kickoff.getTime());
}
