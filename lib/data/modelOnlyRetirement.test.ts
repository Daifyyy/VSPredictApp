import { expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('server-only',()=>({}));
it('retired cron and push endpoints do not access database or provider',async()=>{
 for(const route of [await import('../../app/api/cron/snapshot-odds/route'),await import('../../app/api/cron/send-notifications/route'),await import('../../app/api/push/route'),await import('../../app/api/push/test/route')])expect(route.GET().status).toBe(410);
});
it('has no scheduled odds or push trigger or manual option',()=>{
 const yaml=readFileSync('.github/workflows/cron.yml','utf8');
 expect(yaml).not.toMatch(/- cron: "(?:20 \*|5,35,50|7,22,37,52)/);
 expect(yaml).not.toMatch(/^\s*- (?:snapshot-odds|snapshot-odds-priority|send-notifications)$/m);
 expect(yaml).toContain('settle-results');expect(yaml).toContain('predict-upcoming');expect(yaml).toContain('telegram-digest');
});
it('guards all provider odds entry points before the request',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('network forbidden'));
 const api=await import('./apiFootball');
 expect(await api.fetchOdds(1)).toBeNull();expect(await api.fetchOddsRaw(1)).toEqual([]);expect(await api.fetchLiveOdds(1)).toEqual([]);
 expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});
