import type { UpcomingFixture } from "@/lib/types";

type MatchPair = { teams: readonly [string, string]; title: string; score: number };

const RIVALRIES: readonly MatchPair[] = [
  { teams: ["real madrid", "barcelona"], title: "El Clásico", score: 1_400 },
  { teams: ["real madrid", "atletico madrid"], title: "Madridské derby", score: 1_300 },
  { teams: ["inter", "ac milan"], title: "Derby della Madonnina", score: 1_350 },
  { teams: ["inter", "juventus"], title: "Derby d’Italia", score: 1_250 },
  { teams: ["as roma", "lazio"], title: "Derby della Capitale", score: 1_200 },
  { teams: ["bayern munich", "borussia dortmund"], title: "Der Klassiker", score: 1_300 },
  { teams: ["arsenal", "tottenham"], title: "Severolondýnské derby", score: 1_250 },
  { teams: ["liverpool", "everton"], title: "Merseyside derby", score: 1_200 },
  { teams: ["manchester city", "manchester united"], title: "Manchester derby", score: 1_250 },
  { teams: ["liverpool", "manchester united"], title: "Anglická fotbalová klasika", score: 1_300 },
  { teams: ["paris saint germain", "marseille"], title: "Le Classique", score: 1_200 },
  { teams: ["ajax", "feyenoord"], title: "De Klassieker", score: 1_150 },
  { teams: ["benfica", "porto"], title: "O Clássico", score: 1_150 },
  { teams: ["sporting cp", "benfica"], title: "Lisabonské derby", score: 1_050 },
  { teams: ["slavia praha", "sparta praha"], title: "Pražské derby", score: 1_100 },
  { teams: ["anderlecht", "standard liege"], title: "Belgická klasika", score: 950 },
];

const ELITE_CLUBS = new Set([
  "arsenal", "chelsea", "liverpool", "manchester city", "manchester united", "tottenham",
  "real madrid", "barcelona", "atletico madrid",
  "inter", "ac milan", "juventus", "napoli", "as roma",
  "bayern munich", "borussia dortmund", "bayer leverkusen",
  "paris saint germain", "marseille", "monaco",
  "benfica", "porto", "sporting cp", "ajax", "feyenoord", "psv",
  "slavia praha", "sparta praha", "plzen",
]);

const LEAGUE_PRESTIGE: Record<number, number> = {
  2: 180, 3: 145, 848: 115,
  39: 110, 140: 105, 135: 100, 78: 100, 61: 90,
  94: 72, 88: 70, 144: 60, 345: 58,
};

function normalized(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/\b(fc|cf|afc|ssc|calcio|football club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^internazionale$/, "inter")
    .replace(/^internazionale milano$/, "inter")
    .replace(/^milan$/, "ac milan")
    .replace(/^bayern munchen$/, "bayern munich")
    .replace(/^borussia dortmund$/, "borussia dortmund")
    .replace(/^psg$/, "paris saint germain")
    .replace(/^viktoria plzen$/, "plzen");
}

function pairKey(a: string, b: string): string {
  return [normalized(a), normalized(b)].sort().join("|");
}

const RIVALRY_BY_PAIR = new Map(
  RIVALRIES.map((rivalry) => [pairKey(...rivalry.teams), rivalry])
);

function roundBonus(round?: string | null): number {
  const value = round?.toLocaleLowerCase("en") ?? "";
  if (value.includes("final") && !value.includes("semi") && !value.includes("quarter")) return 1_100;
  if (value.includes("semi")) return 500;
  if (value.includes("quarter")) return 250;
  if (value.includes("round of 16")) return 55;
  return 0;
}

export interface FeaturedFixtureChoice {
  fixture: UpcomingFixture;
  title: string;
  reason: "live" | "rivalry" | "elite" | "prestige";
}

export function fixtureInterest(fixture: UpcomingFixture): number {
  const home = normalized(fixture.home.name);
  const away = normalized(fixture.away.name);
  const rivalry = RIVALRY_BY_PAIR.get(pairKey(home, away));
  const eliteCount = Number(ELITE_CLUBS.has(home)) + Number(ELITE_CLUBS.has(away));
  const rankBonus = [fixture.homeRank, fixture.awayRank].reduce<number>(
    (sum, rank) => sum + (rank != null && rank <= 4 ? 35 : rank != null && rank <= 8 ? 15 : 0),
    0
  );
  return (fixture.live ? 10_000 : 0)
    + (rivalry?.score ?? 0)
    + (eliteCount === 2 ? 850 : eliteCount === 1 ? 180 : 0)
    + (LEAGUE_PRESTIGE[fixture.leagueId] ?? 40)
    + roundBonus(fixture.competitionRound)
    + rankBonus;
}

export function chooseFeaturedFixture(fixtures: UpcomingFixture[]): FeaturedFixtureChoice | null {
  const fixture = [...fixtures].sort((a, b) => {
    const score = fixtureInterest(b) - fixtureInterest(a);
    return score || a.kickoff.localeCompare(b.kickoff) || a.fixtureId - b.fixtureId;
  })[0];
  if (!fixture) return null;
  const rivalry = RIVALRY_BY_PAIR.get(pairKey(fixture.home.name, fixture.away.name));
  const homeElite = ELITE_CLUBS.has(normalized(fixture.home.name));
  const awayElite = ELITE_CLUBS.has(normalized(fixture.away.name));
  if (fixture.live) return { fixture, title: rivalry?.title ?? "Právě se hraje", reason: "live" };
  if (rivalry) return { fixture, title: rivalry.title, reason: "rivalry" };
  const round = fixture.competitionRound?.toLocaleLowerCase("en") ?? "";
  if (round.includes("final") && !round.includes("semi") && !round.includes("quarter")) {
    return { fixture, title: `Finále · ${fixture.leagueName}`, reason: "prestige" };
  }
  if (homeElite && awayElite) {
    return { fixture, title: fixture.europeanCup ? "Evropský souboj velkoklubů" : "Souboj ligových velkoklubů", reason: "elite" };
  }
  return { fixture, title: "Doporučený zápas", reason: "prestige" };
}
