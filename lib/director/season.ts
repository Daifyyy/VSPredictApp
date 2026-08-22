import type { DirectorClub, DirectorMatch } from "@prisma/client";
import { clamp } from "./random";

export function roundRobinSchedule(clubIds: string[], startDay = 3) {
  const ids = [...clubIds];
  if (ids.length % 2) ids.push("BYE");
  const rounds = ids.length - 1; const half = ids.length / 2;
  const rotation = [...ids]; const fixtures: Array<{ round: number; scheduledDay: number; homeClubId: string; awayClubId: string }> = [];
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const a = rotation[i]; const b = rotation[rotation.length - 1 - i];
      if (a !== "BYE" && b !== "BYE") {
        const flip = (round + i) % 2 === 1;
        fixtures.push({ round: round + 1, scheduledDay: startDay + round * 3, homeClubId: flip ? b : a, awayClubId: flip ? a : b });
      }
    }
    rotation.splice(1, 0, rotation.pop()!);
  }
  const second = fixtures.map((fixture) => ({ round: fixture.round + rounds, scheduledDay: fixture.scheduledDay + rounds * 3 + 5, homeClubId: fixture.awayClubId, awayClubId: fixture.homeClubId }));
  return [...fixtures, ...second];
}

export function expectedPoints(homeXg: number, awayXg: number) {
  const delta = homeXg - awayXg;
  const win = 1 / (1 + Math.exp(-1.5 * delta));
  const draw = .26 * Math.exp(-Math.abs(delta) * .65);
  return { home: clamp(3 * win + draw, 0, 3), away: clamp(3 * (1 - win) + draw, 0, 3) };
}

export function tableRows(clubs: DirectorClub[], matches: DirectorMatch[]) {
  const rows = new Map(clubs.map((club) => [club.id, { clubId: club.id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, expectedPoints: 0, performance: 0 }]));
  for (const match of matches.filter((item) => item.status === "PLAYED" && item.homeGoals !== null && item.awayGoals !== null)) {
    const home = rows.get(match.homeClubId); const away = rows.get(match.awayClubId); if (!home || !away) continue;
    home.played++; away.played++; home.goalsFor += match.homeGoals!; home.goalsAgainst += match.awayGoals!; away.goalsFor += match.awayGoals!; away.goalsAgainst += match.homeGoals!;
    if (match.homeGoals! > match.awayGoals!) { home.wins++; away.losses++; home.points += 3; }
    else if (match.homeGoals! < match.awayGoals!) { away.wins++; home.losses++; away.points += 3; }
    else { home.draws++; away.draws++; home.points++; away.points++; }
    if (match.homeXg !== null && match.awayXg !== null) { const xp = expectedPoints(match.homeXg, match.awayXg); home.expectedPoints += xp.home; away.expectedPoints += xp.away; }
  }
  return [...rows.values()].map((row) => ({ ...row, expectedPoints: Number(row.expectedPoints.toFixed(2)), performance: row.played ? Number(((row.points - row.expectedPoints) / row.played).toFixed(3)) : 0 })).sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || a.clubId.localeCompare(b.clubId));
}
