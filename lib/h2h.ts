export interface HeadToHeadMeeting {
  fixtureId: number;
  date: string;
  season: number;
  context: string;
  home: { id: number; name: string; logoUrl: string; goals: number | null; xg: number | null };
  away: { id: number; name: string; logoUrl: string; goals: number | null; xg: number | null };
  corners: { home: number | null; away: number | null };
  cards: { home: number | null; away: number | null };
}

export interface HeadToHeadSummary {
  teamAId: number;
  teamBId: number;
  meetings: HeadToHeadMeeting[];
  sample: number;
  teamAWins: number;
  draws: number;
  teamBWins: number;
  goalsA: number;
  goalsB: number;
  over25: number;
  btts: number;
  advancedSample: number;
  xgA: number | null;
  xgB: number | null;
  confidence: "none" | "limited" | "descriptive";
  olderHistory: boolean;
  updatedAt: string | null;
}

export const H2H_SNAPSHOT_VERSION = 2;

/** Minimální neměnný feature set pro časově korektní backtest bez osobních údajů/UI dat. */
export interface HeadToHeadPredictionSnapshot {
  version: typeof H2H_SNAPSHOT_VERSION;
  capturedAt: string;
  sample: number;
  recentTwoSeasonSample: number;
  sameVenueSample: number;
  teamAWins: number;
  draws: number;
  teamBWins: number;
  goalsPerMatchA: number | null;
  goalsPerMatchB: number | null;
  over25Rate: number | null;
  bttsRate: number | null;
  advancedSample: number;
  xgPerMatchA: number | null;
  xgPerMatchB: number | null;
  oldestMeetingAt: string | null;
  newestMeetingAt: string | null;
}

export function toPredictionSnapshot(
  summary: HeadToHeadSummary,
  homeTeamId: number,
  capturedAt: Date
): HeadToHeadPredictionSnapshot {
  const recentCutoff = new Date(capturedAt);
  recentCutoff.setFullYear(recentCutoff.getFullYear() - 2);
  const completed = summary.teamAWins + summary.draws + summary.teamBWins;
  const dates = summary.meetings.map((meeting) => meeting.date).sort();
  return {
    version: H2H_SNAPSHOT_VERSION,
    capturedAt: capturedAt.toISOString(),
    sample: summary.sample,
    recentTwoSeasonSample: summary.meetings.filter((meeting) => new Date(meeting.date) >= recentCutoff).length,
    sameVenueSample: summary.meetings.filter((meeting) => meeting.home.id === homeTeamId).length,
    teamAWins: summary.teamAWins,
    draws: summary.draws,
    teamBWins: summary.teamBWins,
    goalsPerMatchA: completed ? summary.goalsA / completed : null,
    goalsPerMatchB: completed ? summary.goalsB / completed : null,
    over25Rate: completed ? summary.over25 / completed : null,
    bttsRate: completed ? summary.btts / completed : null,
    advancedSample: summary.advancedSample,
    xgPerMatchA: summary.xgA,
    xgPerMatchB: summary.xgB,
    oldestMeetingAt: dates[0] ?? null,
    newestMeetingAt: dates.at(-1) ?? null,
  };
}

export interface HeadToHeadRow {
  teamId: number;
  fixtureId: number;
  context: string;
  date: Date;
  season: number;
  competitive: boolean;
  isHome: boolean;
  goalsFor: number | null;
  goalsAgainst: number | null;
  xg: number | null;
  xgAgainst: number | null;
  corners: number | null;
  yellowCards: number | null;
  redCards: number | null;
  opponentId: number | null;
  opponentName: string | null;
  opponentLogo: string | null;
  cachedAt: Date;
}

const cards = (row: HeadToHeadRow) =>
  row.yellowCards == null && row.redCards == null
    ? null
    : (row.yellowCards ?? 0) + (row.redCards ?? 0);

/** Čistá interpretace trvalé MatchStatCache; jeden fixture se nikdy nezapočítá dvakrát. */
export function summarizeHeadToHead(
  rows: HeadToHeadRow[],
  teamAId: number,
  teamBId: number,
  now: Date = new Date()
): HeadToHeadSummary {
  const relevant = rows
    .filter((row) =>
      row.competitive && (
        (row.teamId === teamAId && row.opponentId === teamBId) ||
        (row.teamId === teamBId && row.opponentId === teamAId)
      ))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  const byFixture = new Map<number, HeadToHeadRow[]>();
  for (const row of relevant) {
    const fixture = byFixture.get(row.fixtureId) ?? [];
    fixture.push(row);
    byFixture.set(row.fixtureId, fixture);
  }
  const meetings: HeadToHeadMeeting[] = [];
  for (const fixtureRows of byFixture.values()) {
    const a = fixtureRows.find((row) => row.teamId === teamAId);
    const b = fixtureRows.find((row) => row.teamId === teamBId);
    const anchor = a ?? b;
    if (!anchor) continue;
    const homeIsA = a ? a.isHome : !b!.isHome;
    const home = homeIsA ? a : b;
    const away = homeIsA ? b : a;
    const fallbackHomeId = homeIsA ? teamAId : teamBId;
    const fallbackAwayId = homeIsA ? teamBId : teamAId;
    meetings.push({
      fixtureId: anchor.fixtureId,
      date: anchor.date.toISOString(),
      season: anchor.season,
      context: anchor.context,
      home: {
        id: home?.teamId ?? fallbackHomeId,
        name: away?.opponentName ?? (homeIsA ? "Domácí" : "Hosté"),
        logoUrl: away?.opponentLogo ?? "",
        goals: home?.goalsFor ?? away?.goalsAgainst ?? null,
        xg: home?.xg ?? away?.xgAgainst ?? null,
      },
      away: {
        id: away?.teamId ?? fallbackAwayId,
        name: home?.opponentName ?? (homeIsA ? "Hosté" : "Domácí"),
        logoUrl: home?.opponentLogo ?? "",
        goals: away?.goalsFor ?? home?.goalsAgainst ?? null,
        xg: away?.xg ?? home?.xgAgainst ?? null,
      },
      corners: { home: home?.corners ?? null, away: away?.corners ?? null },
      cards: { home: home ? cards(home) : null, away: away ? cards(away) : null },
    });
  }
  meetings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recent = meetings.slice(0, 10);
  let teamAWins = 0, draws = 0, teamBWins = 0, goalsA = 0, goalsB = 0, over25 = 0, btts = 0;
  let advancedSample = 0, xgA = 0, xgB = 0;
  for (const meeting of recent) {
    const aHome = meeting.home.id === teamAId;
    const ga = aHome ? meeting.home.goals : meeting.away.goals;
    const gb = aHome ? meeting.away.goals : meeting.home.goals;
    if (ga != null && gb != null) {
      goalsA += ga; goalsB += gb;
      if (ga > gb) teamAWins++; else if (ga < gb) teamBWins++; else draws++;
      if (ga + gb > 2) over25++;
      if (ga > 0 && gb > 0) btts++;
    }
    const xa = aHome ? meeting.home.xg : meeting.away.xg;
    const xb = aHome ? meeting.away.xg : meeting.home.xg;
    if (xa != null && xb != null) { advancedSample++; xgA += xa; xgB += xb; }
  }
  const newest = relevant[0]?.cachedAt ?? null;
  const oldCutoff = new Date(now); oldCutoff.setFullYear(oldCutoff.getFullYear() - 2);
  const olderHistory = recent.length > 0 && recent.filter((m) => new Date(m.date) < oldCutoff).length > recent.length / 2;
  return {
    teamAId, teamBId, meetings: recent, sample: recent.length, teamAWins, draws, teamBWins,
    goalsA, goalsB, over25, btts, advancedSample,
    xgA: advancedSample ? xgA / advancedSample : null,
    xgB: advancedSample ? xgB / advancedSample : null,
    confidence: recent.length >= 5 ? "descriptive" : recent.length >= 1 ? "limited" : "none",
    olderHistory,
    updatedAt: newest?.toISOString() ?? null,
  };
}
