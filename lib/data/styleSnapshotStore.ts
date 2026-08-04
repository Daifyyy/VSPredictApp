import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { LeagueStyleSnapshot } from "@/lib/types";

const keyOf = (leagueId: number, season: number) => `league-style:v1:${leagueId}:${season}`;

/** Čte i starší snapshot: výpadek obnovy nesmí zneviditelnit poslední platná data. */
export async function readLeagueStyleSnapshot(
  leagueId: number,
  season: number
): Promise<LeagueStyleSnapshot | null> {
  const row = await prisma.apiCache.findUnique({ where: { key: keyOf(leagueId, season) } });
  return row ? (row.payload as unknown as LeagueStyleSnapshot) : null;
}

export async function writeLeagueStyleSnapshot(snapshot: LeagueStyleSnapshot): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const payload = snapshot as unknown as Prisma.InputJsonValue;
  await prisma.apiCache.upsert({
    where: { key: keyOf(snapshot.leagueId, snapshot.season) },
    create: { key: keyOf(snapshot.leagueId, snapshot.season), payload, expiresAt },
    update: { payload, expiresAt },
  });
}
