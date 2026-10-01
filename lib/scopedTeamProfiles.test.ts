import { expect, it, vi } from 'vitest';
import { BoundedCache } from './boundedCache';
import { scopedTeamProfiles } from './scopedTeamProfiles';
import { buildTeams } from './data/mock/seed';
import { compareTeams } from './stats/compare';

const team = { id: 1, name: 'Team', logo: 'logo' };
const stats = () => ({ requests: 0, loads: 0, reused: 0, loadMs: 0 });

it('preserves real comparison and prediction outputs on identical stored inputs', async () => {
  const now = new Date('2026-10-01T10:00:00Z');
  const teams = buildTeams(now).slice(0, 3);
  const identity = (t: typeof teams[number]) => ({ id: t.id, name: t.name, logo: t.logoUrl });
  const scope = scopedTeamProfiles(async t => structuredClone(teams.find(row => row.id === t.id)!), true, stats(), new BoundedCache());
  for (const away of teams.slice(1)) {
    const homeLoaded = await scope.read(identity(teams[0]));
    const awayLoaded = await scope.read(identity(away));
    expect(compareTeams(homeLoaded!, awayLoaded!, now)).toEqual(compareTeams(teams[0], away, now));
  }
  scope.dispose();
});

it('coalesces repeated teams and isolates mutations without altering input values', async () => {
  const cache = new BoundedCache(), counters = stats();
  const source = { history: [{ shots: 12, date: new Date('2026-01-01') }] };
  const load = vi.fn(async () => structuredClone(source));
  const scope = scopedTeamProfiles(load, true, counters, cache);
  const [a, b] = await Promise.all([scope.read(team), scope.read(team)]);
  expect(a).toEqual(source); expect(b).toEqual(source);
  a!.history[0].shots = 99;
  expect(await scope.read(team)).toEqual(source);
  expect(b!.history[0].shots).toBe(12);
  expect(load).toHaveBeenCalledOnce();
  expect(counters).toMatchObject({ requests: 3, loads: 1, reused: 2 });
  scope.dispose(); expect(cache.size).toBe(0);
  await expect(scope.read(team)).rejects.toThrow('closed');
});

it('never reuses across competitions/runs or changed team metadata', async () => {
  const cache = new BoundedCache(), load = vi.fn(async () => ({ ok: true }));
  const a = scopedTeamProfiles(load, true, stats(), cache);
  const b = scopedTeamProfiles(load, true, stats(), cache);
  await a.read(team); await b.read(team);
  await a.read({ ...team, name: 'New name' }); await a.read({ ...team, logo: 'new-logo' });
  expect(load).toHaveBeenCalledTimes(4);
  a.dispose(); expect(cache.size).toBe(1);
  b.dispose(); expect(cache.byteSize).toBe(0);
});

it('does not retain null or failed loads', async () => {
  const cache = new BoundedCache();
  const load = vi.fn<() => Promise<{ ok: boolean } | null>>()
    .mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true });
  const scope = scopedTeamProfiles(load, true, stats(), cache);
  expect(await scope.read(team)).toBeNull();
  await expect(scope.read(team)).rejects.toThrow('offline');
  expect(await scope.read(team)).toEqual({ ok: true });
  expect(load).toHaveBeenCalledTimes(3); scope.dispose();
});

it('honours shared byte limits and disabled mode', async () => {
  const cache = new BoundedCache({ entries: 2, bytes: 20, itemBytes: 10 });
  const load = vi.fn(async () => ({ tooBig: 'abcdefghijklmnop' }));
  const scope = scopedTeamProfiles(load, true, stats(), cache);
  await scope.read(team); await scope.read(team);
  expect(load).toHaveBeenCalledTimes(2); expect(cache.byteSize).toBe(0);
  scope.dispose();
  const disabled = scopedTeamProfiles(load, false, stats(), cache);
  await disabled.read(team); await disabled.read(team);
  expect(load).toHaveBeenCalledTimes(4); expect(cache.size).toBe(0); disabled.dispose();
});

it('bounds tracked keys and clears in-flight loads on disposal', async () => {
  const cache = new BoundedCache(), load = vi.fn(async () => ({ ok: true }));
  const scope = scopedTeamProfiles(load, true, stats(), cache);
  for (let id = 0; id < 40; id++) await scope.read({ ...team, id });
  expect(cache.size).toBe(32);
  scope.dispose(); expect(cache.size).toBe(0);
  let finish!: (value: string) => void;
  const pending = scopedTeamProfiles(() => new Promise<string>(resolve => { finish = resolve; }), true, stats(), cache);
  const request = pending.read(team);
  await Promise.resolve(); pending.dispose(); finish('done'); await request;
  expect(cache.size).toBe(0);
});

it('loads only unique profiles for 50 fixtures, without prefetch or extra concurrency', async () => {
  const cache = new BoundedCache(), counters = stats();
  let active = 0, maxActive = 0;
  const loader = vi.fn(async (t: typeof team) => {
    active++; maxActive = Math.max(maxActive, active);
    await Promise.resolve(); active--;
    return { id: t.id, shots: 10 };
  });
  const scope = scopedTeamProfiles(loader, true, counters, cache);
  expect(loader).not.toHaveBeenCalled();
  for (let fixture = 0; fixture < 50; fixture++) {
    await Promise.all([scope.read({ ...team, id: fixture % 20 }), scope.read({ ...team, id: (fixture + 1) % 20 })]);
  }
  expect(counters).toMatchObject({ requests: 100, loads: 20, reused: 80 });
  expect(maxActive).toBeLessThanOrEqual(2);
  scope.dispose(); expect(cache.byteSize).toBe(0);
});
