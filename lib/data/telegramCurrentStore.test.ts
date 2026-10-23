import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() }));
vi.mock('../db', () => ({ prisma: { apiCache: db } }));
import { readCurrentTelegramTips, saveCurrentTelegramTips } from './telegramCurrentStore';
describe('Telegram current projection store', () => {
  beforeEach(() => { vi.clearAllMocks(); db.upsert.mockResolvedValue({}); db.deleteMany.mockResolvedValue({ count: 0 }); });
  it('reads exactly one compact key, without provider calls or reconstruction', async () => {
    db.findUnique.mockResolvedValue(null);
    expect(await readCurrentTelegramTips('2026-10-23')).toBeNull();
    expect(db.findUnique).toHaveBeenCalledWith({ where: { key: 'telegram-current:v1:2026-10-23' }, select: { payload: true } });
    expect(db.upsert).not.toHaveBeenCalled();
  });
  it('only expires its replaceable projection namespace, not publications', async () => {
    const now = new Date('2026-10-23T10:00:00Z');
    await saveCurrentTelegramTips('2026-10-23', [], now);
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ payload: { version: 1, date: '2026-10-23', asOf: now.toISOString(), items: [] } }) }));
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { key: { startsWith: 'telegram-current:v1:' }, expiresAt: { lt: now } } });
  });
});
