import { describe, expect, it } from "vitest";
import { hashSeed, toDatabaseSeed } from "./random";

describe("persisted director world seed", () => {
  it("fits an unsigned hash into PostgreSQL INT4", () => {
    expect(toDatabaseSeed(3_987_792_253)).toBe(1_840_308_605);
    expect(toDatabaseSeed(3_987_792_253)).toBeLessThanOrEqual(2_147_483_647);
    expect(toDatabaseSeed(3_987_792_253)).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic without changing the general hash function", () => {
    const hash = hashSeed("user", 39, 1, "2026-08-23");
    expect(toDatabaseSeed(hash)).toBe(toDatabaseSeed(hash));
    expect(hash).toBeGreaterThanOrEqual(0);
  });
});
