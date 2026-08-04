import { describe, expect, it } from "vitest";
import { buildCompareHref } from "./compareHref";

describe("buildCompareHref", () => {
  it("adds European context and team metadata", () => {
    const href = buildCompareHref({
      compareMode: "CLUB",
      home: { id: 10, name: "Sparta Praha", logoUrl: "https://img.test/sparta.png" },
      away: { id: 20, name: "Celtic", logoUrl: "https://img.test/celtic.png" },
      homeCompareLeagueId: 2,
      awayCompareLeagueId: 2,
      europeanCup: true,
    });
    const url = new URL(href!, "https://football-insight.test");
    expect(url.searchParams.get("context")).toBe("EURO_CUP");
    expect(url.searchParams.get("homeName")).toBe("Sparta Praha");
    expect(url.searchParams.get("awayName")).toBe("Celtic");
  });

  it("does not add European context to a domestic league link", () => {
    const href = buildCompareHref({
      compareMode: "CLUB",
      home: { id: 10 },
      away: { id: 20 },
      homeCompareLeagueId: 39,
      awayCompareLeagueId: 39,
    });
    expect(href).not.toContain("context=");
  });
});
