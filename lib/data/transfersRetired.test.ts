import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../db',()=>{throw Error('Retired transfers must not import database');});
vi.mock('./apiFootball',()=>{throw Error('Retired transfers must not import provider');});
it('old transfer endpoints return 410 without database or provider dependencies',async()=>{
  for(const route of [await import('../../app/api/transfers/route'),await import('../../app/api/cron/refresh-transfers/route'),await import('../../app/api/cron/import-transfers/route')]){
    const response=route.GET();expect(response.status).toBe(410);expect((await response.json()).limitedReason).toBe('TRANSFERS_RETIRED');
  }
});
it('keeps essential workflows but removes transfer scheduling and manual option',()=>{
  const source=readFileSync('.github/workflows/cron.yml','utf8');expect(source).not.toContain('refresh-transfers');
  for(const name of ['predict-upcoming','settle-results','settle-tips','telegram-digest','refresh-tactics'])expect(source).toContain(name);
});
