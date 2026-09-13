import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/logError";
import { handleTelegramCommand, sendTelegramMessages, telegramConfig } from "@/lib/telegram";

type TelegramUpdate = { update_id?: number; message?: { text?: string; from?: { id?: number }; chat?: { id?: number; type?: string } } };

export async function POST(request: Request) {
  const config = telegramConfig();
  if (!config.webhookSecret || request.headers.get("x-telegram-bot-api-secret-token") !== config.webhookSecret) return new NextResponse(null, { status: 401 });
  let update: TelegramUpdate;
  try { update = await request.json() as TelegramUpdate; } catch { return NextResponse.json({ ok: true }); }
  const updateId = update.update_id; const userId = update.message?.from?.id?.toString(); const chatId = update.message?.chat?.id?.toString(); const text = update.message?.text;
  if (updateId == null || !userId || !chatId || !text || update.message?.chat?.type !== "private" || !config.allowedUsers.has(userId)) return NextResponse.json({ ok: true });
  let receipt;
  try {
    receipt = await prisma.telegramUpdateReceipt.create({ data: { updateId: BigInt(updateId), userId, chatId } });
  } catch {
    receipt = await prisma.telegramUpdateReceipt.findUnique({ where: { updateId: BigInt(updateId) } });
    if (!receipt || receipt.status === "SENT" || receipt.status === "PROCESSING") return NextResponse.json({ ok: true });
    const claimed = await prisma.telegramUpdateReceipt.updateMany({ where: { updateId: BigInt(updateId), status: "FAILED" }, data: { status: "PROCESSING", lastError: null } });
    if (!claimed.count) return NextResponse.json({ ok: true });
  }
  try {
    const stored = Array.isArray(receipt.payload) ? receipt.payload.filter((item): item is string => typeof item === "string") : [];
    const messages = stored.length ? stored : await handleTelegramCommand(userId, text);
    if (!stored.length) await prisma.telegramUpdateReceipt.update({ where: { updateId: BigInt(updateId) }, data: { payload: messages } });
    const messageIds = Array.isArray(receipt.messageIds) ? receipt.messageIds.filter((item): item is number => typeof item === "number") : [];
    await sendTelegramMessages(chatId, messages.slice(messageIds.length), async (messageId) => { messageIds.push(messageId); await prisma.telegramUpdateReceipt.update({ where: { updateId: BigInt(updateId) }, data: { messageIds } }); });
    await prisma.telegramUpdateReceipt.update({ where: { updateId: BigInt(updateId) }, data: { status: "SENT", messageIds } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.telegramUpdateReceipt.update({ where: { updateId: BigInt(updateId) }, data: { status: "FAILED", lastError: message } }).catch(() => undefined);
    logError("telegram/webhook", error, { updateId, userId });
    return NextResponse.json({ error: "Zpracování příkazu selhalo." }, { status: 502 });
  }
}
