import { afterEach, expect, it, vi } from 'vitest';
import { BoundedCache } from './boundedCache';
afterEach(() => vi.useRealTimers());
it('bounds item bytes, total bytes and least recently used entries', async () => {
  const c = new BoundedCache({entries:2,bytes:12,itemBytes:8});
  await c.read('a',1000,async()=> 'aa'); await c.read('b',1000,async()=> 'bb');
  await c.read('a',1000,async()=> 'wrong'); await c.read('c',1000,async()=> 'cc');
  const load=vi.fn(async()=> 'new'); await c.read('b',1000,load); expect(load).toHaveBeenCalledOnce();
  await c.read('big',1000,async()=> 'too large to store');
  expect(c.size).toBeLessThanOrEqual(2); expect(c.byteSize).toBeLessThanOrEqual(12);
});
it('expires and coalesces concurrent reads', async()=> {
  vi.useFakeTimers(); const c=new BoundedCache(), load=vi.fn(async()=>({ok:true}));
  await Promise.all([c.read('a',100,load),c.read('a',100,load)]); expect(load).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(101); await c.read('a',100,load); expect(load).toHaveBeenCalledTimes(2);
});
it('does not resurrect invalidated data from an in-flight load',async()=> {
  const c=new BoundedCache(); let finish!:(value:string)=>void;
  const old=c.read('a',1000,()=>new Promise<string>(resolve=>{finish=resolve;}));
  await Promise.resolve(); c.delete('a'); await c.read('a',1000,async()=> 'fresh'); finish('old'); await old;
  expect(await c.read('a',1000,async()=> 'wrong')).toBe('fresh');
});
it('does not cache rejected requests',async()=> {
  const c=new BoundedCache(); await expect(c.read('a',1000,async()=>{throw Error('offline');})).rejects.toThrow('offline');
  expect(await c.read('a',1000,async()=> 'ok')).toBe('ok');
});
