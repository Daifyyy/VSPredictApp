import type { LeagueTableRow, Venue } from "@/lib/types";

export function leagueRowsForVenue(rows: LeagueTableRow[], venue: Venue): LeagueTableRow[] {
  if (venue === "TOTAL") return rows;
  const splitKey = venue === "HOME" ? "home" : "away";
  return rows
    .map((row) => {
      const split = row[splitKey];
      return {
        ...row,
        rank: 0,
        played: split.played,
        win: split.win,
        draw: split.draw,
        lose: split.lose,
        goalsFor: split.goalsFor,
        goalsAgainst: split.goalsAgainst,
        goalsDiff: split.goalsFor - split.goalsAgainst,
        points: split.win * 3 + split.draw,
        form: null,
        zone: null,
      };
    })
    .sort((a, b) =>
      b.points - a.points || b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor ||
      a.name.localeCompare(b.name, "cs")
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
