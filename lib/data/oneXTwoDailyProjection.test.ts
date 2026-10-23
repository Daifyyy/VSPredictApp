import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ prisma: {} }));
import { normalizeOneXTwoDaily, oneXTwoDailyQuery } from "./oneXTwoDailyProjection";
const row = { fixtureId: 1, homeName: "Home", awayName: "Away", kickoff: new Date("2026-10-23T18:00:00Z"),
  modelVersion: 7, auditModelVersion: "7", model: [.5,.3,.2], market: [.45,.3,.25], quality: "PANEL",
  capturedAt: "2026-10-23T09:00:00Z", predictedAt: "2026-10-23T08:00:00Z", auditKickoff: "2026-10-23T18:00:00Z" };
describe("full outcome daily projection", () => {
  it("keeps the coherent frozen vector including draws", () => {
    expect(normalizeOneXTwoDaily([row])[0]).toMatchObject({ probabilities: [.5,.3,.2], market: [.45,.3,.25] });
  });
  it("rejects post-kickoff, future-generated, postponed and incoherent audits", () => {
    for (const changed of [{ capturedAt: "2026-10-23T18:00:00Z" }, { predictedAt: "2026-10-23T10:00:00Z" },
      { auditKickoff: "2026-10-24T18:00:00Z" }, { model: [.5,.3,.3] }, { auditModelVersion: "6" }]) {
      expect(normalizeOneXTwoDaily([{ ...row, ...changed }])).toEqual([]);
    }
  });
  it("does not fabricate a missing market benchmark", () => {
    expect(normalizeOneXTwoDaily([{ ...row, market: null }])[0].market).toBeNull();
    expect(normalizeOneXTwoDaily([{ ...row, quality: "UNAVAILABLE" }])[0].market).toBeNull();
  });
  it("projects fields and bounds rows without source JSON or odds series", () => {
    const q=oneXTwoDailyQuery(new Date("2026-10-23"), new Date("2026-10-24"));
    expect(q.sql).toContain("LIMIT 201");
    expect(q.sql).toContain('DISTINCT ON (s."fixtureId")');
    expect(q.sql).not.toContain('"inputSnapshot"');
    expect(q.sql).not.toContain('"series"');
    expect(normalizeOneXTwoDaily(Array.from({ length: 210 }, (_,i) => ({...row,fixtureId:i+1})))).toHaveLength(200);
  });
});
