import { describe, expect, it } from "vitest";
import { publishedOutcomeTip } from "./publication";

const row = (over: Partial<Parameters<typeof publishedOutcomeTip>[0]> = {}) => ({
  available: true,
  lowConfidence: false,
  readinessSample: 6,
  homeWin: 0.55,
  draw: 0.3,
  awayWin: 0.15,
  ...over,
});

describe("publishedOutcomeTip", () => {
  it("publikuje hranici 55 % s náskokem 10 bodů", () => {
    expect(publishedOutcomeTip(row())).toEqual({ side: "home", prob: 0.55, policyVersion: 1 });
  });
  it("odmítne 54 %, náskok pod 10 bodů a vzorek 5", () => {
    expect(publishedOutcomeTip(row({ homeWin: 0.54 }))).toBeNull();
    expect(publishedOutcomeTip(row({ homeWin: 0.55, draw: 0.46, awayWin: -0.01 }))).toBeNull();
    expect(publishedOutcomeTip(row({ readinessSample: 5 }))).toBeNull();
  });
  it("odmítne remízu, low confidence a vyrovnaných 36 %", () => {
    expect(publishedOutcomeTip(row({ homeWin: 0.3, draw: 0.55, awayWin: 0.15 }))).toBeNull();
    expect(publishedOutcomeTip(row({ lowConfidence: true }))).toBeNull();
    expect(publishedOutcomeTip(row({ homeWin: 0.36, draw: 0.33, awayWin: 0.31 }))).toBeNull();
  });
});
