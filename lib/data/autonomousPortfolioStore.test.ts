import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
vi.mock("@/lib/db", () => ({ prisma: {
  fixturePrediction: { findUnique: vi.fn() },
  marketSignalSnapshot: { findMany: vi.fn() },
  modelStrategyDefinition: { findUnique: vi.fn() },
  autonomousTipSnapshot: { findUnique: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
} }));
import { prisma } from "@/lib/db";
import { captureAutonomousPortfolio, closeAutonomousPortfolio, settleAutonomousPortfolio } from "./autonomousPortfolioStore";
import type { BookOdds } from "./apiFootball";
import { dailyAutonomousCandidate } from "../picks/dailyAutonomousSource";

const at = new Date("2026-09-22T10:00:00Z");
const kickoff = new Date("2026-09-22T12:00:00Z");
const books = [{ id: 4, name: "Pinnacle", over25: 1.8, under25: 2.1 }] as BookOdds[];
type Stored = Prisma.AutonomousTipSnapshotCreateManyInput;
let stored: Map<string, Stored>;
const key = (row: { fixtureId: number; strategy: string; policyVersion?: number }) => `${row.fixtureId}:${row.strategy}:${row.policyVersion}`;

beforeEach(() => {
  vi.resetAllMocks();
  stored = new Map();
  vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue({
    fixtureId: 1, leagueId: 39, kickoff, homeTeamId: 10, awayTeamId: 20,
    homeName: "Home", awayName: "Away", modelVersion: 7, modelContext: "LEAGUE", contextVersion: 1,
    homeWin: .4, awayWin: .3, draw: .3, over25: .65, bttsYes: .5,
    readinessSample: 6, lowConfidence: false,
  } as never);
  vi.mocked(prisma.marketSignalSnapshot.findMany).mockResolvedValue([
    { market: "OVER_25", series: [{}, {}, {}] },
  ] as never);
  vi.mocked(prisma.modelStrategyDefinition.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.autonomousTipSnapshot.findUnique).mockImplementation(((args: Prisma.AutonomousTipSnapshotFindUniqueArgs) =>
    Promise.resolve(stored.get(key(args.where.fixtureId_strategy_policyVersion!)) ?? null)) as never);
  vi.mocked(prisma.autonomousTipSnapshot.createMany).mockImplementation(((args: Prisma.AutonomousTipSnapshotCreateManyArgs) => {
    const data = (args.data as Stored[])[0];
    if (stored.has(key(data))) return Promise.resolve({ count: 0 });
    stored.set(key(data), { ...data });
    return Promise.resolve({ count: 1 });
  }) as never);
  vi.mocked(prisma.autonomousTipSnapshot.updateMany).mockImplementation(((args: Prisma.AutonomousTipSnapshotUpdateManyArgs) => {
    const data = args.data as Stored;
    const previous = stored.get(key(data));
    if (!previous || previous.status === "candidate") return Promise.resolve({ count: 0 });
    stored.set(key(data), { ...data });
    return Promise.resolve({ count: 1 });
  }) as never);
});

describe("prospective legacy Over capture", () => {
  it("captures a new research cohort, not retired history; current v2 still rejects readiness 6", async () => {
    await captureAutonomousPortfolio(1, books, at);
    expect(stored.get("1:OVER_25:2")?.status).toBe("watch");
    expect(stored.has("1:OVER_25:1")).toBe(false);
    const shadow = stored.get("1:OVER_25_LEGACY_SHADOW:1")!;
    expect(shadow).toMatchObject({ market: "OVER_25", side: "OVER", line: 2.5, status: "candidate", decimalOdds: 1.8, modelProbability: .65, qualifiedAt: at });
    expect(dailyAutonomousCandidate(shadow as never, {} as never, null, at).reason).toBe("INACTIVE_SOURCE_POLICY");
    const frozen = { ...shadow };
    await captureAutonomousPortfolio(1, [{ ...books[0], over25: 2.4 }], new Date(at.getTime() + 60000));
    expect(stored.get("1:OVER_25_LEGACY_SHADOW:1")).toEqual(frozen);
  });

  it("concurrent captures keep the first qualified quote and guarded conditional promotion", async () => {
    await Promise.all([
      captureAutonomousPortfolio(1, books, at),
      captureAutonomousPortfolio(1, [{ ...books[0], over25: 2.2 }], at),
    ]);
    expect(stored.get("1:OVER_25_LEGACY_SHADOW:1")?.decimalOdds).toBe(1.8);
    const promotions = vi.mocked(prisma.autonomousTipSnapshot.updateMany).mock.calls;
    expect(promotions.length).toBeGreaterThan(0);
    for (const [args] of promotions) expect(args.where).toMatchObject({ status: { not: "candidate" }, settledAt: null, capturedAt: { lte: at } });
    expect(prisma.marketSignalSnapshot.findMany).toHaveBeenCalledTimes(2);
  });

  it("promotes watch rows once and captures both cohorts when current rules also pass", async () => {
    const prediction = await prisma.fixturePrediction.findUnique({ where: { fixtureId: 1 } });
    vi.mocked(prisma.marketSignalSnapshot.findMany).mockResolvedValue([{ market: "OVER_25", series: [{}] }] as never);
    await captureAutonomousPortfolio(1, books, at);
    expect(stored.get("1:OVER_25_LEGACY_SHADOW:1")?.status).toBe("watch");
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue({ ...prediction, readinessSample: 8 } as never);
    vi.mocked(prisma.marketSignalSnapshot.findMany).mockResolvedValue([{ market: "OVER_25", series: [{}, {}, {}] }] as never);
    const qualifiedAt = new Date(at.getTime() + 60000);
    expect(await captureAutonomousPortfolio(1, books, qualifiedAt)).toBe(1);
    for (const strategy of ["1:OVER_25:2", "1:OVER_25_LEGACY_SHADOW:1"]) {
      expect(stored.get(strategy)).toMatchObject({ status: "candidate", qualifiedAt, decimalOdds: 1.8 });
    }
    expect(await captureAutonomousPortfolio(1, books, qualifiedAt)).toBe(0);
  });

  it("does not collect after kickoff", async () => {
    await captureAutonomousPortfolio(1, books, kickoff);
    expect(prisma.autonomousTipSnapshot.createMany).not.toHaveBeenCalled();
  });
});

describe("legacy Over shared result pathways", () => {
  it("closes by the actual OVER_25 market and never rewrites the selection", async () => {
    await captureAutonomousPortfolio(1, books, at);
    const shadow = { ...stored.get("1:OVER_25_LEGACY_SHADOW:1"), id: "shadow" };
    vi.mocked(prisma.autonomousTipSnapshot.findMany).mockResolvedValue([shadow] as never);
    await closeAutonomousPortfolio(1, books, new Date(kickoff.getTime() - 10 * 60000));
    expect(prisma.autonomousTipSnapshot.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "shadow" }, data: expect.objectContaining({ closingFreshness: "PRIMARY_30", closingLine: 2.5, clvMethodVersion: 2 }),
    }));
    const data = vi.mocked(prisma.autonomousTipSnapshot.update).mock.calls[0][0].data;
    expect(data).not.toHaveProperty("decimalOdds");
    expect(data).not.toHaveProperty("modelProbability");
    vi.mocked(prisma.autonomousTipSnapshot.update).mockClear();
    await closeAutonomousPortfolio(1, books, new Date(kickoff.getTime() + 1));
    expect(prisma.autonomousTipSnapshot.update).not.toHaveBeenCalled();
  });

  it("settles the new strategy using the same full-time Over outcome, idempotently", async () => {
    vi.mocked(prisma.fixturePrediction.findUnique).mockResolvedValue({ status: "FT", homeGoals: 2, awayGoals: 1 } as never);
    vi.mocked(prisma.autonomousTipSnapshot.findMany).mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "shadow", strategy: "OVER_25_LEGACY_SHADOW", market: "OVER_25", side: "OVER", line: 2.5, decimalOdds: 1.8, stake: 1 },
    ] as never);
    vi.mocked(prisma.autonomousTipSnapshot.updateMany).mockResolvedValue({ count: 1 });
    expect(await settleAutonomousPortfolio(1, at)).toBe(1);
    expect(prisma.autonomousTipSnapshot.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ strategy: { in: expect.arrayContaining(["OVER_25_LEGACY_SHADOW"]) } }) }));
    expect(prisma.autonomousTipSnapshot.updateMany).toHaveBeenCalledWith({ where: { id: "shadow", settledAt: null }, data: { hit: true, profit: .8, settlementStatus: "SETTLED", settledAt: at } });
    vi.mocked(prisma.autonomousTipSnapshot.findMany).mockResolvedValue([]);
    expect(await settleAutonomousPortfolio(1, at)).toBe(0);
  });
});
