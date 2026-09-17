import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ strategyData: vi.fn(), cursorFind: vi.fn(), cursorUpsert: vi.fn(), captureWindow: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { telegramCommandCursor: { findUnique: mocks.cursorFind, upsert: mocks.cursorUpsert } } }));
vi.mock("@/lib/operations", () => ({ upsertIncident: vi.fn() }));
vi.mock("@/lib/data/strategyHubStore", () => ({ strategyHubData: mocks.strategyData }));
vi.mock("@/lib/data/intuitionTicketStore", () => ({ captureIntuitionWindow: mocks.captureWindow }));

import { formatResults, formatTickets, formatTips, handleTelegramCommand, isTelegramDateAllowed, pragueClock, shiftDateKey, splitTelegramBlocks, telegramConfig, telegramStrategyAlias, type TelegramDay } from "./telegram";

const emptyMetrics = { all: {}, recent: {}, selectionAccuracy: null, unit: "SELECTIONS" };
function day(): TelegramDay {
  return {
    date: "2026-09-13", generatedAt: "2026-09-13T07:00:00.000Z",
    strategies: [{ strategy: "TEAM_GOALS", data: {
      opportunities: [0, 1, 2, 3].map((index) => ({ id: String(index), fixtureId: index, leagueId: 1, leagueName: "Liga", kickoff: "2026-09-13T12:00:00Z", homeName: index === 0 ? "A < B" : `Domácí ${index}`, awayName: `Hosté ${index}`, selection: "více než 1,5", reason: "Důvod & kontext", risk: "Riziko", probability: .61, marketProbability: .55, edge: .06, expectedValue: .1, confidence: 12, odds: 1.82, bookmaker: "Book", priceKind: index === 0 ? "SYNTHETIC" : "DIRECT", outcome: "PENDING", score: null, ticketSlots: [] })),
      tickets: [], metrics: emptyMetrics, coverage: { candidates: 4, priced: 4, tickets: 0 }, emptyReason: null,
    } as never }],
  };
}

describe("telegram formatting", () => {
  beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.cursorFind.mockResolvedValue(null); mocks.cursorUpsert.mockResolvedValue({}); mocks.strategyData.mockResolvedValue(day().strategies[0].data); });
  it("uses Prague time across summer and winter", () => {
    expect(pragueClock(new Date("2026-07-10T07:00:00Z"))).toEqual({ date: "2026-07-10", hour: 9 });
    expect(pragueClock(new Date("2026-12-10T08:00:00Z"))).toEqual({ date: "2026-12-10", hour: 9 });
  });
  it("keeps the publication idempotency window open for delayed schedulers", () => {
    expect(pragueClock(new Date("2026-09-13T07:15:00Z")).hour).toBe(9);
    expect(pragueClock(new Date("2026-09-13T08:55:00Z")).hour).toBe(10);
  });
  it("shows a compact top three, marks estimates and escapes HTML", () => {
    const text = formatTips(day()).join("\n");
    expect(text).toContain("1.82 <i>(odhad)</i>"); expect(text).toContain("A &lt; B"); expect(text).toContain("⏳"); expect(text).not.toContain("EV"); expect(text).not.toContain("Model"); expect(text).not.toContain("Domácí 3");
  });
  it("adds one immutable flow diagnosis only to a result payload", () => {
    const payload=day();
    payload.strategies[0].data.opportunities[0].outcome="WON";
    (payload.strategies[0].data.opportunities[0] as typeof payload.strategies[0]["data"]["opportunities"][number] & {flowDiagnosis:{code:string;label:string;summary:string}}).flowDiagnosis={code:"CORRECT_FLOW_BAD_FINISHING",label:"Průběh správně, rozhodlo zakončení",summary:""};
    expect(formatResults(payload).join("\n")).toContain("🧭 Průběh správně, rozhodlo zakončení");
  });
  it("lists every leg of a VALUE or ELO ticket", () => {
    const payload=day();
    payload.strategies=[{strategy:"VALUE",data:{...payload.strategies[0].data,opportunities:payload.strategies[0].data.opportunities.slice(0,2).map(item=>({...item,ticketSlots:[1]})),tickets:[{slot:1,odds:3.31,estimatedPriceCount:0,outcome:"PENDING",profit:null,fixtureIds:[0,1]}]}}];
    const text=formatTickets(payload,"VALUE").join("\n");
    expect(text).toContain("Tiket A");expect(text).toContain("kurz 3.31");expect(text).toContain("A &lt; B");expect(text).toContain("Domácí 1");
  });
  it("splits messages under the Telegram safety limit", () => {
    const chunks = splitTelegramBlocks(["a".repeat(2000), "b".repeat(2000)], 3000);
    expect(chunks).toHaveLength(2); expect(chunks.every((chunk) => chunk.length <= 3000)).toBe(true);
  });
  it("validates aliases and date range", () => {
    expect(telegramStrategyAlias("rohy")).toBe("CORNERS"); expect(telegramStrategyAlias("unknown")).toBeNull();
    expect(shiftDateKey("2026-09-13", -1)).toBe("2026-09-12"); expect(isTelegramDateAllowed("2026-09-20", "2026-09-13")).toBe(true); expect(isTelegramDateAllowed("2026-09-21", "2026-09-13")).toBe(false);
  });
  it("is disabled by default and parses allowed users", () => {
    vi.stubEnv("TELEGRAM_ALLOWED_USER_IDS", "12, 34"); expect(telegramConfig().enabled).toBe(false); expect(telegramConfig().allowedUsers.has("34")).toBe(true);
  });
  it("starts /dalsi after the published top three and persists its cursor", async () => {
    const messages = await handleTelegramCommand("12", "/dalsi tymove_goly", new Date("2026-09-13T08:00:00Z"));
    const text = messages.join("\n"); expect(text).toContain("Domácí 3"); expect(text).not.toContain("A &lt; B");
    expect(mocks.cursorUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ offset: 4 }) }));
  });
});
