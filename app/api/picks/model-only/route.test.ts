import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({user:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/data/modelOnlyStore',()=>({readModelOnly:m.read}));
vi.mock('@/lib/authUser',()=>({getCurrentUser:m.user}));
vi.mock('@/lib/entitlements',()=>({getEntitlement:(u:unknown)=>({pro:!!u})}));
vi.mock('@/lib/rateLimit',()=>({allowRequest:()=>true,clientKey:()=> 'test',tooMany:vi.fn()}));
import { GET } from './route';
beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue(null);m.read.mockResolvedValue({locked:true,forecasts:[],daily:[]});});
it('applies server-side rights and private caching',async()=>{const r=await GET(new Request('http://local/api?date=2026-10-31'));expect(m.read).toHaveBeenCalledWith('2026-10-31',false,0,undefined,false,2003);expect(r.headers.get('Cache-Control')).toBe('private, no-store');});
it('rejects invalid date and unbounded page before data access',async()=>{for(const query of ['date=2026-02-30','page=-1','page=101','page=NaN'])expect((await GET(new Request(`http://local/api?${query}`))).status).toBe(400);expect(m.read).not.toHaveBeenCalled();});
it('reports missing DB/migration as failure, not zero performance',async()=>{m.read.mockRejectedValue(Error('table missing'));expect((await GET(new Request('http://local/api?date=2026-10-31'))).status).toBe(503);});
it('accepts the qualified team filter and retains access to historical policy',async()=>{
 await GET(new Request('http://local/api?date=2026-10-31&source=TEAM_GOALS&qualified=1&policy=2001'));
 expect(m.read).toHaveBeenCalledWith('2026-10-31',false,0,'TEAM_GOALS',true,2001);
 expect((await GET(new Request('http://local/api?policy=999'))).status).toBe(400);
});
