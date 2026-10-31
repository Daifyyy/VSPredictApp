import { expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => { throw Error('Retired live routes must not load DB'); });
vi.mock('@/lib/data/apiFootball', () => { throw Error('Retired live routes must not load provider'); });
import { GET as center } from './route';
import { GET as scores } from '../fixtures/live/route';
import { GET as collect } from '../cron/collect-live/route';
import { GET as schedule } from '../cron/live-schedule/route';
import { GET as watch, POST as watchPost } from './watch/route';
it.each([center, scores, collect, schedule, watch, watchPost])('retired live endpoint is explicit and performs no IO', async handler => {
 const response = handler();
 expect(response.status).toBe(410);
 expect(await response.json()).toMatchObject({ limitedReason: 'LIVE_RETIRED' });
});
