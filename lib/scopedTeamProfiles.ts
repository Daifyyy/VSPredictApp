import { randomUUID } from 'node:crypto';
import { BoundedCache, sharedReadCache } from './boundedCache';

export type FixtureTeamIdentity = { id: number; name: string; logo: string };
export type ProfileLoadStats = { requests: number; loads: number; reused: number; loadMs: number };

/** One competition in one prediction run. Never shared with another run/context.
 * Uses the existing global cache budget, not an additional memory allocation pool.
 * Values are cloned so consumers cannot mutate a later fixture's inputs.
 */
export function scopedTeamProfiles<T>(
  loader: (team: FixtureTeamIdentity) => Promise<T | null>,
  enabled: boolean,
  stats: ProfileLoadStats,
  cache: BoundedCache = sharedReadCache,
) {
  const prefix = `prediction-profiles:${randomUUID()}:`;
  const keys = new Set<string>();
  let closed = false;
  return {
    async read(team: FixtureTeamIdentity): Promise<T | null> {
      if (closed) throw new Error('Prediction profile scope is closed');
      stats.requests++;
      let loaded = false;
      const load = async () => {
        loaded = true;
        stats.loads++;
        const started = performance.now();
        try { return await loader(team); }
        finally { stats.loadMs += performance.now() - started; }
      };
      if (!enabled) return load();
      const key = prefix + JSON.stringify([team.id, team.name, team.logo]);
      // No unbounded key registry even if a provider returns too many fixtures.
      if (!keys.has(key) && keys.size >= 32) return load();
      keys.add(key);
      const value = await cache.read(key, 60_000, load);
      if (value === null) cache.delete(key); // Missing data may recover in this run.
      if (!loaded) stats.reused++;
      return structuredClone(value);
    },
    dispose() {
      closed = true;
      for (const key of keys) cache.delete(key);
      keys.clear();
    },
  };
}
