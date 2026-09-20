import { describe, expect, it } from "vitest";
import { fixtureResultRepair } from "./fixtureResultRepair";
const stored = { fixtureId: 1, leagueId: 61, season: 2026, kickoff: new Date("2026-08-23"), homeTeamId: 85, awayTeamId: 94, homeName: "PSG", awayName: "Rennes", homeLogo: "psg", awayLogo: "rennes" };
const actual = { fixtureId: 1, kickoff: "2026-08-23T18:45:00Z", homeTeamId: 94, awayTeamId: 85, status: "FT", round: "Regular Season - 1", homeGoals: 2, awayGoals: 2 };
describe("fixture fact repair", () => {
  it("corrects identities and quarantines rather than inventing a reversed prediction", () => {
    const result = fixtureResultRepair(stored, actual);
    expect(result).toMatchObject({ homeName: "Rennes", awayName: "PSG", available: false, lowConfidence: true });
    expect(result).not.toHaveProperty("lambdaHome");
    expect(result).not.toHaveProperty("inputSnapshot");
    expect(result).not.toHaveProperty("homeWin");
  });
  it("does not quarantine a date/status correction with unchanged venue", () => {
    expect(fixtureResultRepair(stored, { ...actual, homeTeamId: 85, awayTeamId: 94 })).not.toHaveProperty("available");
  });
  it("rejects unverified final score or different teams", () => {
    expect(() => fixtureResultRepair(stored, { ...actual, homeGoals: null })).toThrow();
    expect(() => fixtureResultRepair(stored, { ...actual, homeTeamId: 999 })).toThrow();
    expect(() => fixtureResultRepair(stored, { ...actual, status: "2H" })).toThrow();
  });
});
