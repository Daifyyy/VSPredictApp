import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/authUser',()=>({getCurrentUser:mocks.user}));
vi.mock('@/lib/entitlements',()=>({isAdminEmail:(email?:string)=>email==='admin@example.test'}));
vi.mock('@/lib/data/matchContextStore',()=>({readMatchContext:mocks.read}));
vi.mock('@/lib/rateLimit',()=>({allowRequest:()=>true,clientKey:()=> 'test',tooMany:()=>new Response(null,{status:429})}));
import { GET } from './route';
beforeEach(()=>{vi.clearAllMocks();mocks.user.mockResolvedValue(null);mocks.read.mockResolvedValue({locked:true,context:null});});
it('rejects invalid fixture before authorization and data access',async()=>{
  for(const value of ['abc','0','-1','1.5','9007199254740992']) expect((await GET(new Request(`http://local/api?fixture=${value}`))).status).toBe(400);
  expect(mocks.user).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled();
});
it('passes server-derived entitlements and prohibits shared caching',async()=>{
  const response=await GET(new Request('http://local/api?fixture=1'));
  expect(mocks.read).toHaveBeenCalledWith(1,false);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  mocks.user.mockResolvedValue({tier:'PRO'});await GET(new Request('http://local/api?fixture=1'));expect(mocks.read).toHaveBeenLastCalledWith(1,true);
});
it('does not portray database failure as an empty successful context',async()=>{
  mocks.read.mockRejectedValue(Error('offline'));const response=await GET(new Request('http://local/api?fixture=1'));
  expect(response.status).toBe(503);expect((await response.json()).reason).toBe('CONTEXT_UNAVAILABLE');
});
