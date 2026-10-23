import type { AIMatch } from './aiResearch';

const DAY = 86400000;
const METRICS = ['GOALS', 'XG', 'SHOTS', 'SHOTS_ON_TARGET', 'SHOTS_INSIDE_BOX', 'CORNERS'] as const;
type Sample = { time: number; own: Array<number | null>; allowed: Array<number | null>; home: boolean; residual: number };
type Profile = { n: number; elo: number; last: number; queue: Sample[]; own: Array<number | null>; allowed: Array<number | null>; residual: number; weight: number; weight2: number; ownWeights: number[]; allowedWeights: number[] };
const empty = (): Profile => ({ n: 0, elo: 1500, last: 0, queue: [], own: METRICS.map(() => null), allowed: METRICS.map(() => null), residual: 0, weight: 0, weight2: 0, ownWeights: METRICS.map(() => 0), allowedWeights: METRICS.map(() => 0) });
const avg = (xs: Array<number | null>) => { const ys = xs.filter((x): x is number => x != null); return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null; };
const variance = (xs: Array<number | null>) => { const mean = avg(xs); return mean == null ? null : avg(xs.map(x => x == null ? null : (x - mean) ** 2)); };
const divide = (a: number | null, b: number | null) => a == null || b == null || b <= 0 ? null : a / b;
export const AI_FEATURES: Array<{ name: string; group: number }> = [
  ...['home', 'away'].flatMap(side => [
    ...['elo', 'sample', 'attack', 'defense', 'effectiveSample'].map(name => ({ name: `${side}.${name}`, group: 1 })),
    ...METRICS.slice(1).flatMap(name => ['own', 'allowed'].map(direction => ({ name: `${side}.${direction}.${name}`, group: 2 }))),
    ...METRICS.flatMap(name => ['L5', 'L10', 'trend', 'variance'].map(window => ({ name: `${side}.${name}.${window}`, group: 3 }))),
    ...['venueAttack', 'venueDefense', 'opponentAdjusted'].map(name => ({ name: `${side}.${name}`, group: 4 })),
    ...['xgPerShot', 'sotPerShot', 'boxPerShot'].map(name => ({ name: `${side}.${name}`, group: 5 })),
    ...['restDays', 'last7', 'last14', 'tempo'].map(name => ({ name: `${side}.${name}`, group: 6 })),
  ]),
  { name: 'eloDifference', group: 1 }, { name: 'homeAttackAwayDefense', group: 5 }, { name: 'awayAttackHomeDefense', group: 5 },
  ...['leagueHomeGoals', 'leagueAwayGoals', 'leagueOver'].map(name => ({ name, group: 1 })),
];
export const AI_FEATURE_NAMES = [...AI_FEATURES.map(f => f.name), ...AI_FEATURES.map(f => `${f.name}.missing`)];
export const AI_FEATURE_GROUPS = [...AI_FEATURES.map(f => f.group), ...AI_FEATURES.map(f => f.group)];

/** Stateful chronological feature builder shared by offline and future batch inference. O(matches), bounded team windows. */
export class AIFeatureBuilder {
  private profiles = new Map<string, Profile>();
  private leagues = new Map<number, { n: number; home: number; away: number; over: number }>();
  private seen = new Set<number>();
  private latest = 0;
  private lastOrigin = 0;
  private key(league: number, team: number) { return `${league}:${team}`; }
  ingest(m: AIMatch) {
    const time = Date.parse(m.date);
    if (!Number.isFinite(time) || time < this.latest || m.homeId === m.awayId
      || ![m.fixtureId, m.leagueId, m.homeId, m.awayId].every(n => Number.isInteger(n) && n > 0)
      || ![m.homeGoals, m.awayGoals].every(n => Number.isInteger(n) && n >= 0)) throw Error('INVALID_AI_HISTORY_ORDER');
    if (this.seen.has(m.fixtureId)) throw Error('DUPLICATE_AI_HISTORY');
    this.seen.add(m.fixtureId);
    const h = this.profiles.get(this.key(m.leagueId, m.homeId)) ?? empty(), a = this.profiles.get(this.key(m.leagueId, m.awayId)) ?? empty();
    const expected = 1 / (1 + 10 ** ((a.elo - h.elo - 60) / 400));
    const delta = 20 * ((m.homeGoals > m.awayGoals ? 1 : m.homeGoals === m.awayGoals ? .5 : 0) - expected);
    const values = (goals: number, metrics?: Record<string, number>) => METRICS.map(k => { const x = k === 'GOALS' ? goals : metrics?.[k]; return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null; });
    const hv = values(m.homeGoals, m.homeMetrics), av = values(m.awayGoals, m.awayMetrics);
    const homeResidual = m.homeGoals - (a.allowed[0] ?? 1.5), awayResidual = m.awayGoals - (h.allowed[0] ?? 1.5);
    for (const [p, own, allowed, home, residual] of [[h, hv, av, true, homeResidual], [a, av, hv, false, awayResidual]] as const) {
      const decay = p.last ? Math.exp(-(time - p.last) / (90 * DAY)) : 0;
      const update = (values: Array<number | null>, means: Array<number | null>, weights: number[]) => values.map((v, i) => {
        const past = weights[i] * decay;
        weights[i] = past + Number(v != null);
        return v == null ? means[i] : ((means[i] ?? 0) * past + v) / weights[i];
      });
      p.own = update(own, p.own, p.ownWeights);
      p.allowed = update(allowed, p.allowed, p.allowedWeights);
      p.residual = (decay * p.weight * p.residual + residual) / (decay * p.weight + 1);
      p.weight = decay * p.weight + 1; p.weight2 = decay ** 2 * p.weight2 + 1;
      p.queue.push({ time, own, allowed, home, residual });
      if (p.queue.length > 40) p.queue.shift();
      p.n++; p.last = time;
    }
    h.elo += delta; a.elo -= delta;
    this.profiles.set(this.key(m.leagueId, m.homeId), h); this.profiles.set(this.key(m.leagueId, m.awayId), a);
    this.latest = time;
    const league = this.leagues.get(m.leagueId) ?? { n: 0, home: 0, away: 0, over: 0 };
    league.n++; league.home += m.homeGoals; league.away += m.awayGoals; league.over += Number(m.homeGoals + m.awayGoals > 2);
    this.leagues.set(m.leagueId, league);
  }
  predict(m: Pick<AIMatch, 'leagueId' | 'homeId' | 'awayId' | 'date'>) {
    const origin = Date.parse(m.date.slice(0, 10));
    if (!Number.isFinite(origin) || origin < this.lastOrigin || this.latest && this.latest + 3 * 3600000 >= origin) throw Error('AI_FEATURE_LEAKAGE');
    this.lastOrigin = origin;
    const h = this.profiles.get(this.key(m.leagueId, m.homeId)) ?? empty(), a = this.profiles.get(this.key(m.leagueId, m.awayId)) ?? empty();
    const team = (p: Profile, home: boolean): Array<number | null> => {
      const q = p.queue, venue = q.filter(s => s.home === home).slice(-10);
      const x: Array<number | null> = [p.elo, p.n, p.own[0], p.allowed[0], p.weight2 > 0 ? p.weight ** 2 / p.weight2 : 0];
      METRICS.slice(1).forEach((_, j) => x.push(p.own[j + 1], p.allowed[j + 1]));
      METRICS.forEach((_, j) => {
        const l5 = avg(q.slice(-5).map(s => s.own[j])), l10 = avg(q.slice(-10).map(s => s.own[j]));
        x.push(l5, l10, l5 == null || l10 == null ? null : l5 - l10, variance(q.slice(-10).map(s => s.own[j])));
      });
      x.push(avg(venue.map(s => s.own[0])), avg(venue.map(s => s.allowed[0])), p.residual);
      // Fixed shrinkage prevents tiny quality denominators from exploding. Never used to derive shots.
      x.push(p.own[1] == null || p.own[2] == null ? null : divide(p.own[1] + 1, p.own[2] + 10), divide(p.own[3], p.own[2]), divide(p.own[4], p.own[2]));
      x.push(p.last ? Math.min(30, (origin - p.last) / DAY) : null, q.filter(s => origin - s.time <= 7 * DAY).length,
        q.filter(s => origin - s.time <= 14 * DAY).length, p.own[2] == null || p.allowed[2] == null ? null : p.own[2]! + p.allowed[2]!);
      return x;
    };
    const league = this.leagues.get(m.leagueId);
    const raw = [...team(h, true), ...team(a, false), h.elo - a.elo,
      h.own[0] == null || a.allowed[0] == null ? null : h.own[0]! * a.allowed[0]!,
      a.own[0] == null || h.allowed[0] == null ? null : a.own[0]! * h.allowed[0]!,
      league ? league.home / league.n : null, league ? league.away / league.n : null, league ? (league.over + 1) / (league.n + 2) : null];
    return { values: [...raw, ...raw.map(v => v == null ? 1 : 0)], coverage: raw.filter(v => v != null).length / raw.length,
      homeSample: h.n, awaySample: a.n, latestHistory: this.latest ? new Date(this.latest).toISOString() : null };
  }
}
