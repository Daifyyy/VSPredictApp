import { describe, expect, it } from "vitest";
import type { BookOdds } from "@/lib/data/apiFootball";
import { clvV2, closingFreshness, comparableMarketQuote } from "./comparableMarketQuote";

const book = (id: number, name: string, over25: number, under25: number): BookOdds => ({ id, name, home: 2, draw: 3, away: 4, over25, under25, btts: 2, bttsNo: 2 });

describe("ComparableMarketQuote", () => {
  it("uses best allowed execution price and median-logit panel benchmark", () => {
    const quote = comparableMarketQuote({ books: [book(4, "Pinnacle", 1.9, 2), book(8, "Bet365", 2, 1.9), book(99, "Other", 9, 1.01)], market: "OVER_25", side: "OVER", line: 2.5, sampledAt: new Date() });
    expect(quote.decimalOdds).toBe(2);
    expect(quote.bookmakerId).toBe(8);
    expect(quote.benchmarkQuality).toBe("PANEL");
    expect(quote.panelSize).toBe(2);
  });

  it("marks Pinnacle-only separately", () => {
    const quote = comparableMarketQuote({ books: [book(4, "Pinnacle", 1.9, 2)], market: "OVER_25", side: "OVER", sampledAt: new Date() });
    expect(quote.benchmarkQuality).toBe("PINNACLE_SINGLE");
  });

  it("enforces freshness, same line and same book for the primary gate", () => {
    const kickoff = new Date("2026-09-14T12:00:00Z");
    const opening = comparableMarketQuote({ books: [book(4, "P", 2, 2), book(8, "B", 1.9, 2.1)], market: "OVER_25", side: "OVER", line: 2.5, sampledAt: new Date("2026-09-13T12:00:00Z") });
    const closing = comparableMarketQuote({ books: [book(4, "P", 1.8, 2.2), book(8, "B", 2.1, 1.8)], market: "OVER_25", side: "OVER", line: 2.5, sampledAt: new Date("2026-09-14T11:45:00Z") });
    expect(closingFreshness(kickoff, closing.sampledAt)).toBe("PRIMARY_30");
    const result = clvV2({ opening, closing, kickoff });
    expect(result.priceClv).not.toBeNull();
    expect(result.probabilityClv).not.toBeNull();
  });

  it("rejects post-kickoff and stale closing samples", () => {
    const kickoff = new Date("2026-09-14T12:00:00Z");
    expect(closingFreshness(kickoff, new Date("2026-09-14T12:01:00Z"))).toBe("STALE");
    expect(closingFreshness(kickoff, new Date("2026-09-14T10:44:00Z"))).toBe("STALE");
  });

  it("keeps a bookmaker switch out of the primary validation gate", () => {
    const kickoff = new Date("2026-09-14T12:00:00Z");
    const opening = comparableMarketQuote({ books: [book(4, "P", 2.1, 1.8), book(8, "B", 2, 1.9)], market: "OVER_25", side: "OVER", line: 2.5, sampledAt: new Date("2026-09-13T12:00:00Z") });
    const closing = comparableMarketQuote({ books: [book(4, "P", 1.8, 2.1), book(8, "B", 2.2, 1.75)], market: "OVER_25", side: "OVER", line: 2.5, sampledAt: new Date("2026-09-14T11:40:00Z") });
    const result = clvV2({ opening, closing, kickoff });
    expect(result.sameBook).toBe(false);
    expect(result.eligibleForPrimaryGate).toBe(false);
  });

  it("does not invent a benchmark without the opposite side", () => {
    const incomplete = { ...book(4, "P", 2, 2), under25: null };
    const quote = comparableMarketQuote({ books: [incomplete], market: "OVER_25", side: "OVER", sampledAt: new Date() });
    expect(quote.fairProbability).toBeNull();
    expect(quote.benchmarkQuality).toBe("UNAVAILABLE");
  });
});
