import { prisma } from "@/lib/db";
import { normalizeRefereeName } from "@/lib/picks/cards";
import { getRefereeProfile } from "./refereeStore";

export interface RefereeSuggestion {
  key: string;
  name: string;
  sample: number;
  leagueIds: number[];
}

const surname = (value: string) => normalizeRefereeName(value).split(" ").at(-1) ?? "";

export async function searchKnownReferees(query: string): Promise<RefereeSuggestion[]> {
  const normalized = normalizeRefereeName(query);
  if (normalized.length < 3) return [];
  const groups = await prisma.refereeMatch.groupBy({
    by: ["refereeKey"],
    where: { refereeKey: { contains: normalized } },
    _count: { fixtureId: true },
    _max: { kickoff: true },
  });
  const ranked = groups
    .map((group) => ({
      key: group.refereeKey,
      sample: group._count.fixtureId,
      latest: group._max.kickoff?.getTime() ?? 0,
      rank: surname(group.refereeKey).startsWith(normalized)
        ? 0
        : group.refereeKey.startsWith(normalized) ? 1 : 2,
    }))
    .sort((a, b) => a.rank - b.rank || b.latest - a.latest || b.sample - a.sample || a.key.localeCompare(b.key, "cs"))
    .slice(0, 8);
  if (!ranked.length) return [];
  const rows = await prisma.refereeMatch.findMany({
    where: { refereeKey: { in: ranked.map((item) => item.key) } },
    orderBy: { kickoff: "desc" },
    select: { refereeKey: true, refereeName: true, leagueId: true },
  });
  const details = new Map<string, { name: string; leagues: Set<number> }>();
  for (const row of rows) {
    const current = details.get(row.refereeKey);
    if (current) current.leagues.add(row.leagueId);
    else details.set(row.refereeKey, { name: row.refereeName, leagues: new Set([row.leagueId]) });
  }
  return ranked.flatMap((item) => {
    const detail = details.get(item.key);
    return detail ? [{ key: item.key, name: detail.name, sample: item.sample, leagueIds: [...detail.leagues] }] : [];
  });
}

export async function assignKnownReferee(fixtureId: number, refereeKey: string, adminEmail: string) {
  const now = new Date();
  const [prediction, known] = await Promise.all([
    prisma.fixturePrediction.findUnique({ where: { fixtureId } }),
    prisma.refereeMatch.findFirst({
      where: { refereeKey },
      orderBy: { kickoff: "desc" },
      select: { refereeName: true, refereeKey: true },
    }),
  ]);
  if (!prediction) throw new RefereeAssignmentError(404, "Zápas nemá uloženou predikci.");
  if (prediction.status !== "NS" || prediction.kickoff <= now) {
    throw new RefereeAssignmentError(409, "Rozhodčího lze doplnit pouze před výkopem.");
  }
  if (!known) throw new RefereeAssignmentError(400, "Vybraný rozhodčí není v historii.");
  if (prediction.lambdaCardsHomeBeforeRef == null || prediction.lambdaCardsAwayBeforeRef == null) {
    throw new RefereeAssignmentError(409, "Pro zápas není dostupný model karet.");
  }
  const profile = await getRefereeProfile(known.refereeName, prediction.leagueId, prediction.kickoff, prediction.modelContext);
  const home = Math.min(8, Math.max(0.3, prediction.lambdaCardsHomeBeforeRef * profile.factor));
  const away = Math.min(8, Math.max(0.3, prediction.lambdaCardsAwayBeforeRef * profile.factor));
  await prisma.$transaction([
    prisma.fixturePrediction.update({
      where: { fixtureId },
      data: {
        refereeName: known.refereeName,
        refereeKey: known.refereeKey,
        refereeSource: "MANUAL",
        refereeAssignedAt: now,
        refereeAssignedBy: adminEmail,
        refereeFactor: profile.factor,
        refereeSample: profile.sample,
        lambdaCardsHome: home,
        lambdaCardsAway: away,
      },
    }),
    prisma.refereeAssignmentAudit.create({
      data: {
        fixtureId,
        previousName: prediction.refereeName,
        newName: known.refereeName,
        previousSource: prediction.refereeSource,
        newSource: "MANUAL",
        changedBy: adminEmail,
      },
    }),
  ]);
  return { name: known.refereeName, factor: profile.factor, sample: profile.sample };
}

export class RefereeAssignmentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
