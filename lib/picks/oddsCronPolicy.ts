import type { Prisma } from "@prisma/client";
import { LEGACY_OVER_SHADOW_STRATEGY } from "./autonomousPortfolio";

export const ODDS_MAX_ATTEMPTS_PER_FIXTURE = 3;

/** Research uses spare capacity behind qualified production picks; never expands quotas. */
export function priorityCaptureWhere(now: Date, closingOnly: boolean): Prisma.AutonomousTipSnapshotWhereInput {
  const production: Prisma.AutonomousTipSnapshotWhereInput = {
    strategy: { not: LEGACY_OVER_SHADOW_STRATEGY },
    OR: closingOnly ? [{ status: "candidate" }] : [
      { status: "candidate" },
      { status: "watch", edge: { gte: -0.02 } },
    ],
  };
  return {
    kickoff: { gt: now, lte: new Date(now.getTime() + 90 * 60_000) },
    OR: closingOnly ? [production] : [
      production,
      { strategy: LEGACY_OVER_SHADOW_STRATEGY, status: "candidate" },
    ],
  };
}

export function closingPrioritySets(rows: Array<{ fixtureId: number; strategy: string; status: string }>, ticketIds: number[], closingOnly: boolean) {
  const p0 = new Set([...ticketIds, ...rows.filter(r => r.status === "candidate" && r.strategy !== LEGACY_OVER_SHADOW_STRATEGY).map(r => r.fixtureId)]);
  const p1 = new Set(closingOnly ? [] : rows.filter(r => !p0.has(r.fixtureId)).map(r => r.fixtureId));
  return { p0, p1 };
}

export function allowedOddsFixtures(input: { requested: number; globalRemaining: number; oddsRemaining: number }) {
  return Math.max(0, Math.min(input.requested, input.globalRemaining, Math.floor(input.oddsRemaining / ODDS_MAX_ATTEMPTS_PER_FIXTURE)));
}

export function priorityOrder<T extends { fixtureId: number; kickoff: Date }>(rows: T[], p0: ReadonlySet<number>) {
  return [...rows].sort((a, b) => Number(!p0.has(a.fixtureId)) - Number(!p0.has(b.fixtureId)) || a.kickoff.getTime() - b.kickoff.getTime());
}
