import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ publish: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/telegram", () => ({ publishTelegramMorning: mocks.publish }));
vi.mock("@/lib/cronAuth", () => ({ requireCronAuth: mocks.auth }));
vi.mock("@/lib/logError", () => ({ logError: vi.fn() }));
import { GET } from "./route";

describe("telegram digest cron", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockReturnValue(null); mocks.publish.mockResolvedValue({ dryRun: true }); });
  it("remains cron protected", async () => { const denied = new Response(null, { status: 401 }); mocks.auth.mockReturnValue(denied); expect(await GET(new Request("http://local/api/cron/telegram-digest"))).toBe(denied); expect(mocks.publish).not.toHaveBeenCalled(); });
  it("supports protected forced dry runs", async () => { const response = await GET(new Request("http://local/api/cron/telegram-digest?dryRun=1&force=1")); expect(response.status).toBe(200); expect(mocks.publish).toHaveBeenCalledWith(expect.any(Date), { dryRun: true, force: true }); });
});
