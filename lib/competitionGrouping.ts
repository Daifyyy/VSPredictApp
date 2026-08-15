import {
  catalogLeagueName,
  competitionGroup,
  publicCompetitionOrder,
  type CompetitionGroup,
} from "@/lib/data/catalog";

export interface CompetitionFixtureLike {
  fixtureId: number;
  kickoff: string;
  leagueId: number;
  leagueName: string;
  leagueLogoUrl?: string;
}

export interface CompetitionFixtureGroup<T> {
  leagueId: number;
  name: string;
  logoUrl: string;
  kind: CompetitionGroup;
  fixtures: T[];
}

/** Jeden deterministický princip pro Program, Predikce i Tipovačku. */
export function groupCompetitionFixtures<T extends CompetitionFixtureLike>(
  fixtures: readonly T[],
): CompetitionFixtureGroup<T>[] {
  const groups = new Map<number, CompetitionFixtureGroup<T>>();
  for (const fixture of fixtures) {
    let group = groups.get(fixture.leagueId);
    if (!group) {
      group = {
        leagueId: fixture.leagueId,
        name: catalogLeagueName(fixture.leagueId, fixture.leagueName),
        logoUrl: fixture.leagueLogoUrl ?? `https://media.api-sports.io/football/leagues/${fixture.leagueId}.png`,
        kind: competitionGroup(fixture.leagueId),
        fixtures: [],
      };
      groups.set(fixture.leagueId, group);
    }
    group.fixtures.push(fixture);
  }
  return [...groups.values()]
    .sort((a, b) => publicCompetitionOrder(a.leagueId) - publicCompetitionOrder(b.leagueId))
    .map((group) => ({
      ...group,
      fixtures: [...group.fixtures].sort((a, b) =>
        new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime() || a.fixtureId - b.fixtureId),
    }));
}

export function localDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function competitionGroupLabel(kind: CompetitionGroup): string {
  if (kind === "EUROPE") return "Evropské poháry";
  if (kind === "NATIONAL") return "Reprezentace";
  return "Klubové ligy";
}
