import { describe, expect, it } from "vitest";
import { referenceLineQuote } from "./books";

const book = (id: number, name: string, corners: Array<{ line: number; over: number | null; under: number | null }>) => ({
  id, name, home: null, draw: null, away: null, over25: null, under25: null, btts: null, bttsNo: null, corners,
});

describe("referenceLineQuote", () => {
  it("vezme kurz i fair pravděpodobnost ze stejné preferované knihy a linie", () => {
    const quote = referenceLineQuote([
      book(2, "Fallback", [{ line: 9.5, over: 2.2, under: 1.7 }]),
      book(1, "Sharp", [{ line: 9.5, over: 1.8, under: 2.05 }]),
    ], "corners", 9.5, "under", [1]);
    expect(quote?.bookmaker).toBe("Sharp");
    expect(quote?.odds).toBe(2.05);
    expect(quote?.probability).toBeCloseTo((1 / 2.05) / (1 / 1.8 + 1 / 2.05));
  });

  it("nemíchá různé linie ani jednostranné nabídky", () => {
    expect(referenceLineQuote([
      book(1, "A", [{ line: 9.5, over: 1.9, under: null }]),
      book(2, "B", [{ line: 10.5, over: 1.9, under: 1.9 }]),
    ], "corners", 9.5, "over", [1])).toBeNull();
  });
});
