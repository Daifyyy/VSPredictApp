import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ tickets: vi.fn(), tips: vi.fn(), signals: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: {
  intuitionTicket: { findMany: mocks.tickets },
  autonomousTipSnapshot: { findMany: mocks.tips },
  marketSignalSnapshot: { findMany: mocks.signals },
} }));
vi.mock('@/lib/data/intuitionTicketStore', () => ({ previewIntuitionTickets: vi.fn() }));
import { strategyHubDailySummary } from './strategyHubStore';

describe('daily summary publication sources', () => {
  it('counts the restored Over source and excludes research 1X2', async () => {
    mocks.tickets.mockResolvedValue([]);
    mocks.tips.mockResolvedValue([{ strategy: 'OVER_25_LEGACY_SHADOW', fixtureId: 10 }]);
    mocks.signals.mockResolvedValue([]);
    const summary = await strategyHubDailySummary('2026-10-23');
    const sources = mocks.tips.mock.calls[0][0].where.OR;
    expect(sources).toContainEqual(expect.objectContaining({ strategy: 'OVER_25_LEGACY_SHADOW', policyVersion: 1 }));
    expect(sources.some((source: { strategy: string }) => ['OVER_25', 'ONE_X_TWO', 'ONE_X_TWO_GUARDED'].includes(source.strategy))).toBe(false);
    expect(summary.strategies.find(row => row.strategy === 'OVER_25')?.opportunities).toBe(1);
    expect(summary.strategies.find(row => row.strategy === 'ONE_X_TWO')).toMatchObject({ opportunities: 0, emptyReason: 'ONE_X_TWO_RESEARCH_ONLY' });
  });
});
