import { afterEach, describe, expect, it, vi } from 'vitest';
const read = vi.hoisted(() => vi.fn());
vi.mock('./data/resourceBudgetStore', () => ({ readResourceBudget: read }));
import { resourceBudgetGuard } from './resourceBudgetGuard';
import { requireCronAuth } from './cronAuth';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('resource boundary', () => {
  it('does not read the database while disabled', async () => {
    vi.stubEnv('RESOURCE_BUDGET_ENFORCEMENT_ENABLED', 'false');
    expect(await resourceBudgetGuard('predict-upcoming')).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it('emergency stop works without a database and without a retryable HTTP failure', async () => {
    vi.stubEnv('RESOURCE_BUDGET_FORCE_STOP', 'true');
    const result = await resourceBudgetGuard('settle-results');
    expect(result?.status).toBe(200);
    expect((await result!.json()).status).toBe('RESOURCE_LIMITED');
    expect(read).not.toHaveBeenCalled();
  });
  it('authenticates before reading the quota', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.stubEnv('RESOURCE_BUDGET_ENFORCEMENT_ENABLED', 'true');
    expect((await requireCronAuth(new Request('https://example.test/api/cron/collect-live')))?.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it('stops publication but keeps settlement in critical mode', async () => {
    vi.stubEnv('RESOURCE_BUDGET_ENFORCEMENT_ENABLED', 'true');
    read.mockResolvedValue({ mode: 'CRITICAL', limitedReason: 'neon.transfer:CRITICAL' });
    expect(await resourceBudgetGuard('settle-results')).toBeNull();
    expect(await resourceBudgetGuard('telegram-digest')).not.toBeNull();
    expect(await resourceBudgetGuard('daily-selection')).not.toBeNull();
  });
  it('fails safely when quota lookup fails', async () => {
    vi.stubEnv('RESOURCE_BUDGET_ENFORCEMENT_ENABLED', 'true');
    read.mockRejectedValue(new Error('offline'));
    expect((await (await resourceBudgetGuard('predict-upcoming'))!.json()).limitedReason).toBe('RESOURCE_READING_UNAVAILABLE');
  });
});
