import { beforeEach, describe, expect, it, vi } from "vitest";

const { runAutomaticCalibration } = vi.hoisted(() => ({ runAutomaticCalibration: vi.fn() }));
vi.mock("@/lib/cronAuth", () => ({ requireCronAuth: () => null }));
vi.mock("@/lib/logError", () => ({ logError: vi.fn() }));
vi.mock("@/lib/cronResult", () => ({ cronJson: (_scope: string, stats: object) => Response.json({ ok: true, ...stats }) }));
vi.mock("@/lib/operations", () => ({ withCronRun: async (_job: string, execute: () => Promise<unknown>) => execute() }));
vi.mock("@/lib/data/automaticCalibration", () => ({ runAutomaticCalibration }));

describe("GET /api/cron/calibrate-models", () => {
  beforeEach(() => runAutomaticCalibration.mockReset());

  it("odmítne neznámý kontext", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/calibrate-models?context=OTHER"));
    expect(response.status).toBe(400);
    expect(runAutomaticCalibration).not.toHaveBeenCalled();
  });

  it("méně než pět výsledků vrátí jako bezpečný no-op", async () => {
    runAutomaticCalibration.mockResolvedValue({
      context: "LEAGUE", modelVersion: 7, eligible: 204, previouslyEvaluated: 200,
      newResults: 4, pending: 4, ran: false, definitions: [],
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/cron/calibrate-models?context=LEAGUE"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reason).toBe("WAITING_FOR_FIVE_RESULTS");
    expect(body.remaining).toBe(4);
    expect(runAutomaticCalibration).toHaveBeenCalledWith("LEAGUE");
  });
});
