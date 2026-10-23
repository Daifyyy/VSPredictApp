import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadTelegramDay, publishedResults } from "./telegram";

const mocks = vi.hoisted(() => ({ aiDay: vi.fn(), strategyData: vi.fn(), cursorFind: vi.fn(), cursorUpsert: vi.fn(), captureWindow: vi.fn(), publications: vi.fn(), flows: vi.fn() }));
vi.mock('./data/aiResearchStore', () => ({ readAIResearchDay: mocks.aiDay }));
vi.mock("@/lib/db", () => ({ prisma: { telegramCommandCursor: { findUnique: mocks.cursorFind, upsert: mocks.cursorUpsert }, telegramPublication: { findMany: mocks.publications }, matchFlowEvaluationSnapshot: { findMany: mocks.flows } } }));
vi.mock("@/lib/operations", () => ({ upsertIncident: vi.fn() }));
vi.mock("@/lib/data/strategyHubStore", () => ({ strategyHubData: mocks.strategyData }));
vi.mock("@/lib/data/intuitionTicketStore", () => ({ captureIntuitionWindow: mocks.captureWindow }));
vi.mock("@/lib/data/telegramCurrentStore", () => ({ readCurrentTelegramTips: vi.fn(async () => ({
  version: 1, date: '2026-09-13', asOf: '2026-09-13T08:00:00Z',
  items: [0, 1, 2, 3].map(i => ({ id: String(i), fixtureId: i, strategy: 'CORNERS', marketKey: '["CORNERS","OVER",9.5]', kickoff: '2026-09-13T12:00:00Z', homeName: `Domácí ${i}`, awayName: 'Hosté', selection: 'Rohy', odds: 1.82, oddsAt: '2026-09-13T08:00:00Z', bookmaker: 'Book' }))
})) }));

import { formatResults, formatTickets, formatTips, handleTelegramCommand, isTelegramDateAllowed, pragueClock, shiftDateKey, splitTelegramBlocks, telegramConfig, telegramStrategyAlias, type TelegramDay } from "./telegram";

const emptyMetrics = { all: {}, recent: {}, selectionAccuracy: null, unit: "SELECTIONS" };
function day(): TelegramDay {
  return {
    date: "2026-09-13", generatedAt: "2026-09-13T07:00:00.000Z",
    strategies: [{ strategy: "CORNERS", data: {
      opportunities: [0, 1, 2, 3].map((index) => ({ id: String(index), fixtureId: index, leagueId: 1, leagueName: "Liga", kickoff: "2026-09-13T12:00:00Z", homeName: index === 0 ? "A < B" : `Domácí ${index}`, awayName: `Hosté ${index}`, selection: "více než 1,5", reason: "Důvod & kontext", risk: "Riziko", probability: .61, marketProbability: .55, edge: .06, expectedValue: .1, confidence: 12, odds: 1.82, bookmaker: "Book", priceKind: index === 0 ? "SYNTHETIC" : "DIRECT", outcome: "PENDING", score: null, ticketSlots: [] })),
      tickets: [], metrics: emptyMetrics, coverage: { candidates: 4, priced: 4, tickets: 0 }, emptyReason: null,
    } as never }],
  };
}

describe("telegram formatting", () => {
  it('authorizes AI commands before reading the stored projection', async () => {
    vi.stubEnv('TELEGRAM_ALLOWED_USER_IDS', '12');
    vi.stubEnv('AI_RESEARCH_TELEGRAM_ENABLED', 'true');
    mocks.aiDay.mockResolvedValue(null);
    expect(await handleTelegramCommand('99', '/tipy ai')).toEqual([]);
    expect(mocks.aiDay).not.toHaveBeenCalled();
    expect((await handleTelegramCommand('12', '/tipy ai')).join(' ')).toContain('neověřená');
    expect(mocks.aiDay).toHaveBeenCalledTimes(1);
    expect(mocks.strategyData).not.toHaveBeenCalled();
  });
  it('includes only the originally published AI TOP3 in morning results', async () => {
    const ai = { version: 1 as const, date: '2026-09-13', asOf: day().generatedAt, artifactId: 'base', research: true as const, forecasts: [], rejected: [],
      picks: [1, 2, 3, 4].map(i => ({ id: `ai-${i}`, fixtureId: i, homeName: 'Home', awayName: 'Away', kickoff: '2026-09-13T12:00:00Z',
        probability: .6, odds: 1.9, bookmaker: 'Book', quotedAt: day().generatedAt, outcome: 'PENDING', profit: null, priceClv: null, currentEligible: true })) };
    mocks.publications.mockResolvedValue([{ kind: 'STRATEGIES', payload: { ...day(), ai } }]);
    mocks.aiDay.mockResolvedValue({ ...ai, picks: ai.picks.map(p => ({ ...p, outcome: 'LOST', currentEligible: false })) });
    mocks.flows.mockResolvedValue([]);
    const result = await publishedResults(ai.date, 'channel');
    expect(result.ai?.picks.map(p => p.id)).toEqual(['ai-1', 'ai-2', 'ai-3']);
  });
  it("does not turn research 1X2 into new tips, but keeps result evaluation", async () => {
    const payload=day();payload.strategies[0].strategy="ONE_X_TWO";
    expect(formatTips(payload).join(" ")).not.toContain("1.82");
    expect(formatTips(payload).join(" ")).toContain("výzkum");
    payload.strategies[0].data.opportunities[0].outcome="WON";
    expect(formatResults(payload).join(" ")).toContain("1.82");
    await loadTelegramDay(payload.date,"PUBLISH");
    expect(mocks.strategyData).not.toHaveBeenCalledWith("ONE_X_TWO",payload.date);
  });
  it("distributes the active Over even though the old ledger identity is paused", async () => {
    const payload = await loadTelegramDay("2026-10-23", "PUBLISH");
    expect(mocks.strategyData).toHaveBeenCalledWith("OVER_25", "2026-10-23");
    expect(formatTips(payload, "OVER_25").join(" ")).toContain("1.82");
  });
  it("resolves an old published Over by ID without mixing new picks or mutating cached data", async () => {
    const data = day().strategies[0].data;
    const current = { ...data, opportunities: [{ ...data.opportunities[0], id: "new", outcome: "WON" as const }] };
    const old = { ...data, opportunities: [{ ...data.opportunities[0], id: "old", outcome: "LOST" as const }] };
    mocks.strategyData.mockImplementation((_strategy, _date, cohort) => Promise.resolve(cohort === "current" ? old : current));
    mocks.publications.mockResolvedValue([{ kind: "STRATEGIES", payload: { ...day(), strategies: [{ strategy: "OVER_25", data: old }] } }]);
    mocks.flows.mockResolvedValue([]);
    const result = await publishedResults("2026-10-22", "channel");
    expect(result.strategies.find(row => row.strategy === "OVER_25")?.data.opportunities.map(item => [item.id, item.outcome])).toEqual([["old", "LOST"]]);
    expect(current.opportunities.map(item => item.id)).toEqual(["new"]);
    expect(mocks.strategyData).toHaveBeenCalledWith("OVER_25", "2026-10-22", "current");
  });
  it("does not republish paused candidates but still shows their results", async () => {
    vi.stubEnv("STRATEGY_FOCUS_MODE_ENABLED", "true");
    const payload = day();
    expect(formatTips(payload).join(" ")).not.toContain("1.82");
    payload.strategies[0].data.opportunities[0].outcome = "WON";
    expect(formatResults(payload).join(" ")).toContain("1.82");
    const publish = await loadTelegramDay(payload.date, "PUBLISH");
    expect(publish.strategies.find(row => row.strategy === "CORNERS")?.data).toMatchObject({ opportunities: [], metrics: null });
    expect(mocks.strategyData).not.toHaveBeenCalledWith("CORNERS", payload.date);
    expect(mocks.strategyData).toHaveBeenCalledWith("VALUE", payload.date);
    expect(mocks.strategyData).toHaveBeenCalledWith("ELO_INTUITION", payload.date);
    await loadTelegramDay(payload.date, "READ");
    expect(mocks.strategyData).toHaveBeenCalledWith("CORNERS", payload.date);
  });
  it("blocks cached team recommendations but preserves result formatting", () => {
    const payload = day();
    payload.strategies[0].strategy = "TEAM_GOALS";
    expect(formatTips(payload).join(" ")).not.toContain("1.82");
    payload.strategies[0].data.opportunities[0].outcome = "WON";
    expect(formatResults(payload).join(" ")).toContain("1.82");
  });
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
    vi.stubEnv('TELEGRAM_ALLOWED_USER_IDS', '12');
    const messages = await handleTelegramCommand("12", "/dalsi rohy", new Date("2026-09-13T08:00:00Z"));
    const text = messages.join("\n"); expect(text).toContain("Domácí 3"); expect(text).not.toContain("A &lt; B");
    expect(mocks.cursorUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ offset: 8 }) }));
  });
});
