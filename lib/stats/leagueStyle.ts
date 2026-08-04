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
  possession: { label: "Kontrola míče", short: "Kontrola", note: "Skóre vychází z průměrného držení míče: 30 % a méně = 0/10, 50 % = 5/10 a 70 % a více = 10/10. Popisuje míru kontroly, ne automaticky kvalitu hry." },
  buildup: { label: "Styl útoku", short: "Útok", note: "Podíl střel z pokutového území na všech zakončeních převedený na škálu 0–10. Vyšší hodnota značí častější zakončení zblízka; je to odhad způsobu útoku, nikoli přímé měření kombinací." },
  pressing: { label: "Aktivita bez míče", short: "Aktivita", note: "Orientační odhad podle počtu faulů na zápas: 8 a méně = 0/10, 14 = 5/10 a 20 a více = 10/10. Vyšší skóre značí častější narušování hry a soubojovou aktivitu, ale bez pozičních dat a PPDA neurčuje výšku presinku ani obranného bloku." },
  efficiency: { label: "Efektivita střel", short: "Efektivita", note: "Podíl střel na branku ze všech střel převedený přímo na škálu 0–10: například 40 % střel na branku = 4/10. Měří přesnost zakončení, nikoli počet vstřelených gólů." },
  defense: { label: "Obranná odolnost", short: "Obrana", note: "Skóre vychází z průměrného obdrženého xG: 2,5 xGA a více = 0/10, 1,5 = 5/10 a 0,5 a méně = 10/10. Kde xGA chybí, používají se inkasované góly jako méně přesná náhrada." },
};

const VENUES: Venue[] = ["TOTAL", "HOME", "AWAY"];

export function buildLeagueStyleSnapshot(
  leagueId: number,
  season: number,
  profiles: TeamProfileCore[],
  updatedAt = new Date().toISOString(),
  baselineProfiles: TeamProfileCore[] = []
): LeagueStyleSnapshot {
  const rankings = {} as LeagueStyleSnapshot["rankings"];
  const coverage = {} as LeagueStyleSnapshot["coverage"];

  for (const venue of VENUES) {
    rankings[venue] = {} as Record<LeagueStyleKey, LeagueStyleRankingEntry[]>;
    const eligibleTeams = new Set<number>();
    for (const key of LEAGUE_STYLE_KEYS) {
      const entries = profiles.flatMap((profile) => {
        const current = profile.styles[venue].find((item) => item.key === key);
        const baselineProfile = baselineProfiles.find((item) => item.team.id === profile.team.id);
        const baseline = baselineProfile?.styles[venue].find((item) => item.key === key);
        if (!current?.available && !baseline?.available) return [];
        const currentSeasonSample = current?.available ? current.sampleSize : 0;
        const baselineSample = baseline?.available ? baseline.sampleSize : 0;
        // Už první letošní zápas tvoří většinu skóre. Loňský základ pak rychle mizí
        // a od sedmi použitelných utkání už se do skóre vůbec nepromítá.
        const currentSeasonWeight = currentSeasonSample > 0
          ? baselineSample > 0 ? Math.min(1, 0.65 + currentSeasonSample * 0.05) : 1
          : 0;
        const baselineWeight = 1 - currentSeasonWeight;
        const score = currentSeasonSample > 0
          ? current!.score * currentSeasonWeight + (baseline?.score ?? current!.score) * baselineWeight
          : baseline!.score;
        const usedBaselineSample = baselineWeight > 0 ? baselineSample : 0;
        const sampleSize = currentSeasonSample + usedBaselineSample;
        const lowConfidence = sampleSize < 4;
        if (!lowConfidence) eligibleTeams.add(profile.team.id);
        return [{
          rank: 0,
          teamId: profile.team.id,
          name: profile.team.name,
          logoUrl: profile.team.logoUrl,
          score: Math.round(score * 10) / 10,
          sampleSize,
          currentSeasonSample,
          baselineSample: usedBaselineSample,
          currentSeasonWeight,
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
