import { describe, expect, it } from "vitest";
import {
  MODEL_CONTEXT_VERSION,
  isCurrentContextVersion,
  modelContextForLeague,
} from "./modelContext";

describe("modelContext", () => {
  it("odděluje ligu, Evropu a reprezentace", () => {
    expect(modelContextForLeague(345)).toBe("LEAGUE");
    expect(modelContextForLeague(2)).toBe("EURO_CUP");
    expect(modelContextForLeague(5)).toBe("NATIONAL");
  });

  it("zachová ligový vzorek a odmítne starou evropskou verzi", () => {
    expect(isCurrentContextVersion({ leagueId: 345, modelContext: "LEAGUE", contextVersion: 1 })).toBe(true);
    expect(isCurrentContextVersion({ leagueId: 2, modelContext: "EURO_CUP", contextVersion: 1 })).toBe(false);
    expect(MODEL_CONTEXT_VERSION.EURO_CUP).toBe(2);
  });
});
