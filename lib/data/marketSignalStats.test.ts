import { describe, expect, it } from "vitest";
import { effectiveClose } from "./marketSignalStats";

const kickoff = new Date("2026-08-15T14:00:00Z");

describe("effectiveClose", () => {
  it("vezme nejnovější čerstvý bod časové řady", () => {
    expect(effectiveClose({
      kickoff,
      closeMarketProbability: 0.51,
      closedAt: new Date("2026-08-15T11:00:00Z"),
      series: [{ t: 180, p: 0.51 }, { t: 40, p: 0.56 }],
    })).toEqual({ probability: 0.56, minutesToKickoff: 40 });
  });

  it("předčasný vzorek nevydává za closing", () => {
    expect(effectiveClose({
      kickoff,
      closeMarketProbability: 0.51,
      closedAt: new Date("2026-08-15T11:00:00Z"),
      series: [{ t: 180, p: 0.51 }, { t: 76, p: 0.54 }],
    })).toBeNull();
  });

  it("použije čerstvý historický plný snapshot bez řady", () => {
    expect(effectiveClose({
      kickoff,
      closeMarketProbability: 0.55,
      closedAt: new Date("2026-08-15T13:00:00Z"),
      series: null,
    })).toEqual({ probability: 0.55, minutesToKickoff: 60 });
  });
});
