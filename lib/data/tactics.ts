import { isRealDataConfigured, prisma } from "@/lib/db";
import { buildTacticalProfile, type TacticalMatch, type TacticalProfile } from "@/lib/tactics";

/** Pouze databázové čtení. Veřejné zobrazení nikdy nedotahuje sestavy z API-Football. */
export async function getTeamTacticalProfile(teamId: number, before = new Date(), limit = 10): Promise<TacticalProfile> {
  if (!isRealDataConfigured()) return buildTacticalProfile([], limit);
  const rows = await prisma.matchStatCache.findMany({
    where: { teamId, competitive: true, formation: { not: null }, date: { lt: before } },
    orderBy: { date: "desc" },
    take: limit,
    select: { fixtureId: true, date: true, formation: true, isHome: true, coachId: true, coachName: true, coachPhoto: true },
  });
  return buildTacticalProfile(rows.flatMap((row): TacticalMatch[] => row.formation ? [{
    fixtureId: row.fixtureId,
    date: row.date.toISOString(),
    formation: row.formation,
    isHome: row.isHome,
    coachId: row.coachId,
    coachName: row.coachName,
    coachPhoto: row.coachPhoto,
  }] : []), limit);
}

export async function saveFixtureLineups(fixtureId: number, lineups: Array<{ team: { id: number }; formation?: string | null; coach?: { id?: number | null; name?: string | null; photo?: string | null } | null }>): Promise<number> {
  let updated = 0;
  for (const lineup of lineups) {
    const result = await prisma.matchStatCache.updateMany({
      where: { fixtureId, teamId: lineup.team.id },
      data: {
        formation: lineup.formation?.trim() || null,
        coachId: lineup.coach?.id ?? null,
        coachName: lineup.coach?.name?.trim() || null,
        coachPhoto: lineup.coach?.photo ?? null,
        lineupCheckedAt: new Date(),
      },
    });
    updated += result.count;
  }
  return updated;
}

export async function markLineupChecked(fixtureId: number): Promise<void> {
  await prisma.matchStatCache.updateMany({ where: { fixtureId }, data: { lineupCheckedAt: new Date() } });
}
