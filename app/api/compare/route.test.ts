import { expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => { throw Error('Retired comparison must not access DB'); });
vi.mock('@/lib/data/repository', () => { throw Error('Retired comparison must not load teams'); });
import { GET } from './route';
it('retires free-form inference without querying data', async () => {
  const response = GET();
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({ limitedReason: 'FREE_COMPARE_RETIRED' });
});
