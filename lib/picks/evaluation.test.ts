import { describe, expect, it } from "vitest";
import { binaryOutcome } from "./evaluation";

describe("binaryOutcome count markets", () => {
  it("vyhodnotí Over i Under proti uložené linii", () => {
    expect(binaryOutcome("CORNERS", "OVER", null, null, 9.5, 10)).toBe(true);
    expect(binaryOutcome("CORNERS", "OVER", null, null, 9.5, 9)).toBe(false);
    expect(binaryOutcome("CORNERS", "UNDER", null, null, 9.5, 9)).toBe(true);
  });

  it("nepovažuje chybějící skutečný počet za nulu", () => {
    expect(binaryOutcome("CORNERS", "UNDER", null, null, 9.5, null)).toBeNull();
  });
  it("settles fouls through the shared count-market path", () => {
    expect(binaryOutcome("FOULS", "OVER", null, null, 24.5, 25)).toBe(true);
    expect(binaryOutcome("FOULS", "UNDER", null, null, 24.5, 24)).toBe(true);
  });
});
