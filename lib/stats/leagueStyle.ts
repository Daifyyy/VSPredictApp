import type {
  LeagueStyleKey,
  LeagueStyleRankingEntry,
  LeagueStyleSnapshot,
  Venue,
} from "@/lib/types";
import type { TeamProfileCore } from "@/lib/teamProfile";

export const LEAGUE_STYLE_KEYS: LeagueStyleKey[] = [
  "possession",
  "buildup",
  "pressing",
  "efficiency",
  "defense",
];

export const LEAGUE_STYLE_META: Record<
  LeagueStyleKey,
  { label: string; short: string; note: string }
> = {
  possession: { label: "Kontrola míče", short: "Kontrola", note: "Vyšší skóre značí častější kontrolu držení míče." },
  buildup: { label: "Styl útoku", short: "Útok", note: "Odhad kombinačního útoku podle podílu zakončení z vápna." },
  pressing: { label: "Aktivita bez míče", short: "Aktivita", note: "Orientační proxy aktivity napadání z dostupných zápasových statistik." },
  efficiency: { label: "Efektivita střel", short: "Efektivita", note: "Podíl střel, které míří na branku." },
  defense: { label: "Obranná odolnost", short: "Obrana", note: "Jak málo kvalitních šancí tým dovoluje; přednost má xGA." },
};

const VENUES: Venue[] = ["TOTAL", "HOME", "AWAY"];

export function buildLeagueStyleSnapshot(
  leagueId: number,
  season: number,
  profiles: TeamProfileCore[],
  updatedAt = new Date().toISOString()
): LeagueStyleSnapshot {
  const rankings = {} as LeagueStyleSnapshot["rankings"];
  const coverage = {} as LeagueStyleSnapshot["coverage"];

  for (const venue of VENUES) {
    rankings[venue] = {} as Record<LeagueStyleKey, LeagueStyleRankingEntry[]>;
    const eligibleTeams = new Set<number>();
    for (const key of LEAGUE_STYLE_KEYS) {
      const entries = profiles.flatMap((profile) => {
        const dimension = profile.styles[venue].find((item) => item.key === key);
        if (!dimension?.available) return [];
        const lowConfidence = dimension.lowConfidence || dimension.sampleSize < 4;
        if (!lowConfidence) eligibleTeams.add(profile.team.id);
        return [{
          rank: 0,
          teamId: profile.team.id,
          name: profile.team.name,
          logoUrl: profile.team.logoUrl,
          score: dimension.score,
          sampleSize: dimension.sampleSize,
          lowConfidence,
        }];
      });
      entries.sort((a, b) =>
        Number(a.lowConfidence) - Number(b.lowConfidence) ||
        b.score - a.score ||
        a.name.localeCompare(b.name, "cs")
      );
      rankings[venue][key] = entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
    }
    coverage[venue] = { eligible: eligibleTeams.size, total: profiles.length };
  }

  return { leagueId, season, updatedAt, coverage, rankings };
}

export function publicLeagueStyleSnapshot(snapshot: LeagueStyleSnapshot): LeagueStyleSnapshot {
  const rankings = {} as LeagueStyleSnapshot["rankings"];
  for (const venue of VENUES) {
    rankings[venue] = {} as Record<LeagueStyleKey, LeagueStyleRankingEntry[]>;
    for (const key of LEAGUE_STYLE_KEYS) {
      rankings[venue][key] = snapshot.rankings[venue][key]
        .filter((entry) => !entry.lowConfidence)
        .slice(0, 5);
    }
  }
  return { ...snapshot, rankings };
}
