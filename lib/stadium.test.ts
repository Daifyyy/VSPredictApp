import { describe, expect, it } from "vitest";
import { localizeStadiumSurface } from "./stadium";

describe("localizeStadiumSurface", () => {
  it.each([
    ["grass", "Přírodní tráva"],
    ["Natural Grass", "Přírodní tráva"],
    ["artificial turf", "Umělý trávník"],
    ["synthetic", "Umělý trávník"],
    ["hybrid-grass", "Hybridní trávník"],
  ])("přeloží %s", (source, expected) => {
    expect(localizeStadiumSurface(source)).toBe(expected);
  });

  it("prázdnou hodnotu skryje a neznámou kultivovaně zachová", () => {
    expect(localizeStadiumSurface("  ")).toBeNull();
    expect(localizeStadiumSurface("clay")).toBe("Clay");
  });
});
