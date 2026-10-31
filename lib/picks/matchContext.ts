import type { MatchStat, Metric, Team } from '../types';

export const CONTEXT_METRICS = ['GOALS_FOR', 'GOALS_AGAINST', 'XG', 'XG_AGAINST', 'SHOTS', 'SHOTS_AGAINST', 'SHOTS_ON_TARGET', 'SHOTS_ON_TARGET_AGAINST', 'SHOTS_INSIDE_BOX', 'CORNERS', 'FOULS', 'YELLOW_CARDS', 'POSSESSION'] as const satisfies readonly Metric[];
export type ContextMetric = typeof CONTEXT_METRICS[number];
type Summary = { sample: number; metrics: Record<ContextMetric, { value: number | null; sample: number }> };
export type TeamMatchContext = {
  teamId: number; name: string; sample: number; oldest: string | null; latest: string | null;
  overall: Summary; venue: Summary; venueLabel: 'HOME' | 'AWAY'; restDays: number | null;
  recent: Array<{ fixtureId: number; date: string; opponent: string | null; home: boolean; goalsFor: number; goalsAgainst: number }>;
  tactics: { sample: number; latest: string | null; primary: string | null; stability: number | null;
    formations: Array<{ name: string; count: number }>; coach: { name: string; observed: number; comparable: number; consecutive: number } | null };
};
export type MatchContextSnapshot = {
  version: 1; fixtureId: number; kickoff: string; capturedAt: string; context: string;
  home: TeamMatchContext; away: TeamMatchContext;
  model: { version: number; lambdaHome: number; lambdaAway: number; over25: number; homeWin: number; draw: number; awayWin: number; strengthSource: string; homeStrength: { attack: number; defense: number; sample: number } | null; awayStrength: { attack: number; defense: number; sample: number } | null };
  referee: { name: string | null; factor: number | null; sample: number | null };
  missing: string[];
};
function summarize(rows: MatchStat[]): Summary {
  return { sample: rows.length, metrics: Object.fromEntries(CONTEXT_METRICS.map(key => {
    const values = rows.map(row => row.metrics[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
    return [key, { value: values.length ? values.reduce((a,b) => a+b,0)/values.length : null, sample: values.length }];
  })) as Summary['metrics'] };
}
export function teamMatchContext(team: Team, kickoff: string, capturedAt: string, home: boolean): TeamMatchContext {
  const cutoff = Math.min(Date.parse(kickoff), Date.parse(capturedAt));
  const unique = new Map<number, MatchStat>();
  // Explicit conservative result-availability margin; never use the predicted match.
  for (const row of [...team.leagueMatches, ...(team.euroMatches ?? [])].sort((a,b) => Date.parse(b.date)-Date.parse(a.date))) {
    if (!row.competitive || Date.parse(row.date) + 3 * 3600_000 >= cutoff || !Number.isFinite(Date.parse(row.date))
      || !Number.isFinite(row.metrics.GOALS_FOR) || !Number.isFinite(row.metrics.GOALS_AGAINST)) continue;
    if (!unique.has(row.fixtureId)) unique.set(row.fixtureId, row);
  }
  const all = [...unique.values()];
  const rows = all.slice(0,10);
  const tactical = rows.filter(row => row.tactical && Date.parse(row.tactical.observedAt) <= cutoff);
  const forms = new Map<string, number>();
  for (const row of tactical) { const name = row.tactical?.formation?.trim(); if(name) forms.set(name,(forms.get(name)??0)+1); }
  const formations = [...forms].map(([name,count]) => ({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  const formationSample = formations.reduce((sum,f)=>sum+f.count,0);
  // Coach continuity starts with the latest match only: do not hide a missing latest observation.
  const last = rows[0]?.tactical;
  const validLast = last && Date.parse(last.observedAt) <= cutoff && last.coachName;
  const same = (row: MatchStat) => Boolean(validLast && row.tactical && Date.parse(row.tactical.observedAt) <= cutoff
    && (last!.coachId != null && row.tactical.coachId != null ? row.tactical.coachId === last!.coachId : row.tactical.coachName === last!.coachName));
  let consecutive = 0; for(const row of rows) { if(!same(row)) break; consecutive++; }
  return { teamId: team.id, name: team.name, sample: rows.length, oldest: rows.at(-1)?.date ?? null, latest: rows[0]?.date ?? null,
    overall: summarize(rows), venue: summarize(all.filter(row => row.isHome === home && !row.isNeutral).slice(0,10)), venueLabel: home?'HOME':'AWAY',
    restDays: rows.length ? (Date.parse(kickoff)-Date.parse(rows[0].date))/86400_000 : null,
    recent: rows.slice(0,5).map(row => ({ fixtureId: row.fixtureId, date: row.date, opponent: row.opponent?.name || null, home: row.isHome, goalsFor: row.metrics.GOALS_FOR!, goalsAgainst: row.metrics.GOALS_AGAINST! })),
    tactics: { sample: formationSample, latest: tactical[0]?.date ?? null, primary: formations[0]?.name ?? null,
      stability: formationSample ? formations[0].count/formationSample : null, formations,
      coach: validLast ? { name: last!.coachName!, observed: rows.filter(same).length, comparable: tactical.filter(row=>row.tactical?.coachName).length, consecutive } : null } };
}

/** Prospective first capture only. Existing context is never retrospectively rewritten. */
export function freezeMatchContext(existing: unknown, incoming: MatchContextSnapshot | undefined, now: Date) {
  if (existing != null) return existing as MatchContextSnapshot;
  if (!incoming || !Number.isFinite(+now) || !Number.isFinite(Date.parse(incoming.kickoff)) || !Number.isFinite(Date.parse(incoming.capturedAt)) || Date.parse(incoming.capturedAt) > +now
    || +now >= Date.parse(incoming.kickoff)) return undefined;
  return incoming;
}
