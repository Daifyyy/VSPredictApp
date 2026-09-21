import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), command: vi.fn(), send: vi.fn(), create: vi.fn(), find: vi.fn(), update: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/telegram", () => ({ telegramConfig: mocks.config, handleTelegramCommand: mocks.command, sendTelegramMessages: mocks.send }));
vi.mock("@/lib/db", () => ({ prisma: { telegramUpdateReceipt: { create: mocks.create, findUnique: mocks.find, update: mocks.update, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/logError", () => ({ logError: vi.fn() }));
vi.mock("@/lib/operations", () => ({ upsertIncident: vi.fn().mockResolvedValue({}) }));
import { POST } from "./route";

const update = { update_id: 7, message: { text: "/help", from: { id: 12 }, chat: { id: 12, type: "private" } } };
describe("telegram webhook", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.config.mockReturnValue({ webhookSecret: "secret", allowedUsers: new Set(["12"]) }); mocks.command.mockResolvedValue(["help"]); mocks.send.mockResolvedValue([1]); mocks.create.mockResolvedValue({ payload: [], messageIds: [], status: "PROCESSING" }); mocks.update.mockResolvedValue({}); });
  it("rejects an invalid Telegram secret", async () => { const response = await POST(new Request("http://local/api/telegram/webhook", { method: "POST", body: JSON.stringify(update) })); expect(response.status).toBe(401); expect(mocks.command).not.toHaveBeenCalled(); });
  it("silently ignores unauthorized users", async () => { mocks.config.mockReturnValue({ webhookSecret: "secret", allowedUsers: new Set() }); const response = await POST(new Request("http://local/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "secret" }, body: JSON.stringify(update) })); expect(response.status).toBe(200); expect(mocks.command).not.toHaveBeenCalled(); });
  it("answers an authorized private command", async () => { const response = await POST(new Request("http://local/api/telegram/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "secret" }, body: JSON.stringify(update) })); expect(response.status).toBe(200); expect(mocks.command).toHaveBeenCalledWith("12", "/help"); expect(mocks.send).toHaveBeenCalledWith("12", ["help"], expect.any(Function)); });
  it("does not resend a daily command after an ambiguous timeout",async()=>{
    const daily={...update,message:{...update.message,text:"/vyber"}};
    const request=()=>new Request("http://local/api/telegram/webhook",{method:"POST",headers:{"x-telegram-bot-api-secret-token":"secret"},body:JSON.stringify(daily)});
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    expect((await POST(request())).status).toBe(502);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:"UNKNOWN"})}));
    mocks.create.mockRejectedValueOnce(new Error("unique"));mocks.find.mockResolvedValueOnce({status:"UNKNOWN"});
    expect((await POST(request())).status).toBe(200);expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
