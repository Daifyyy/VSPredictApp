export interface TacticalMatch {
  fixtureId: number;
  date: string;
  formation: string;
  isHome: boolean;
  coachId: number | null;
  coachName: string | null;
  coachPhoto: string | null;
}

export interface FormationUsage {
  formation: string;
  matches: number;
  share: number;
}

export interface TacticalProfile {
  sampleSize: number;
  primaryFormation: string | null;
  formations: FormationUsage[];
  homeFormation: string | null;
  awayFormation: string | null;
  stability: number | null;
  defensiveLine: "BACK_THREE" | "BACK_FOUR" | "MIXED" | null;
  recentChange: boolean;
  coach: { id: number | null; name: string; photo: string | null; matchesInSample: number } | null;
  matches: TacticalMatch[];
}

function normalizedFormation(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function usage(matches: TacticalMatch[]): FormationUsage[] {
  const counts = new Map<string, number>();
  for (const match of matches) {
    const formation = normalizedFormation(match.formation);
    if (formation) counts.set(formation, (counts.get(formation) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([formation, count]) => ({ formation, matches: count, share: matches.length ? count / matches.length : 0 }))
    .sort((a, b) => b.matches - a.matches || a.formation.localeCompare(b.formation, "cs"));
}

function defenders(formation: string): number | null {
  const first = Number(formation.split("-")[0]);
  return Number.isFinite(first) ? first : null;
}

export function buildTacticalProfile(input: TacticalMatch[], limit = 10): TacticalProfile {
  const matches = [...input]
    .filter((match) => normalizedFormation(match.formation))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, limit);
  const formations = usage(matches);
  const home = usage(matches.filter((match) => match.isHome));
  const away = usage(matches.filter((match) => !match.isHome));
  const backThree = matches.filter((match) => defenders(match.formation) === 3).length;
  const backFour = matches.filter((match) => defenders(match.formation) === 4).length;
  const latestCoach = matches.find((match) => match.coachName)?.coachName ?? null;
  const coachMatch = latestCoach ? matches.find((match) => match.coachName === latestCoach) : null;
  const recent = usage(matches.slice(0, 3))[0]?.formation ?? null;
  const earlier = usage(matches.slice(3))[0]?.formation ?? null;
  return {
    sampleSize: matches.length,
    primaryFormation: formations[0]?.formation ?? null,
    formations,
    homeFormation: home[0]?.formation ?? null,
    awayFormation: away[0]?.formation ?? null,
    stability: formations[0]?.share ?? null,
    defensiveLine: backThree > backFour ? "BACK_THREE" : backFour > backThree ? "BACK_FOUR" : backThree || backFour ? "MIXED" : null,
    recentChange: Boolean(recent && earlier && recent !== earlier),
    coach: latestCoach ? {
      id: coachMatch?.coachId ?? null,
      name: latestCoach,
      photo: coachMatch?.coachPhoto ?? null,
      matchesInSample: matches.filter((match) => match.coachName === latestCoach).length,
    } : null,
    matches,
  };
}
