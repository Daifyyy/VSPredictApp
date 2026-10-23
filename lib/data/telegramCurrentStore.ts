import 'server-only';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { currentTipsProjection, TELEGRAM_CURRENT_KEY, type CurrentTips } from '../picks/telegramCurrent';
import type { DailyPublicationCandidate } from './dailySelectionStore';

export async function saveCurrentTelegramTips(date: string, candidates: DailyPublicationCandidate[], now: Date) {
  const payload = currentTipsProjection(date, candidates, now);
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 250_000) throw Error('TELEGRAM_CURRENT_TOO_LARGE');
  const key = TELEGRAM_CURRENT_KEY + date, expiresAt = new Date(+now + 2 * 86400_000);
  await prisma.apiCache.upsert({ where: { key }, create: { key, payload: payload as unknown as Prisma.InputJsonValue, expiresAt },
    update: { payload: payload as unknown as Prisma.InputJsonValue, expiresAt } });
  // Only this replaceable projection namespace; never publication history or ledgers.
  await prisma.apiCache.deleteMany({ where: { key: { startsWith: TELEGRAM_CURRENT_KEY }, expiresAt: { lt: now } } });
}
export async function readCurrentTelegramTips(date: string): Promise<CurrentTips | null> {
  const row = await prisma.apiCache.findUnique({ where: { key: TELEGRAM_CURRENT_KEY + date }, select: { payload: true } });
  return row?.payload as unknown as CurrentTips | null ?? null;
}
