export interface SearchableTeam {
  id: number;
  name: string;
  logoUrl: string;
  leagueId: number;
  leagueName: string;
  country: string;
}

export function normalizeTeamQuery(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/\s+/g, " ");
}

export function searchTeams(
  catalog: readonly SearchableTeam[],
  query: string,
  limit = 8
): SearchableTeam[] {
  const needle = normalizeTeamQuery(query);
  if (needle.length < 2 || limit <= 0) return [];

  return catalog
    .map((team) => {
      const name = normalizeTeamQuery(team.name);
      const position = name.indexOf(needle);
      const score = name === needle ? 0 : name.startsWith(needle) ? 1 : position >= 0 ? 2 : 3;
      return { team, name, position, score };
    })
    .filter((item) => item.score < 3)
    .sort((a, b) =>
      a.score - b.score ||
      a.position - b.position ||
      a.name.localeCompare(b.name, "cs-CZ") ||
      a.team.leagueName.localeCompare(b.team.leagueName, "cs-CZ")
    )
    .slice(0, limit)
    .map((item) => item.team);
}
