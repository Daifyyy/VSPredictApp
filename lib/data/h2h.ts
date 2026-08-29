import { isRealDataConfigured, prisma } from "@/lib/db";
import { summarizeHeadToHead, type HeadToHeadSummary } from "@/lib/h2h";

export async function getHeadToHead(teamAId: number, teamBId: number): Promise<HeadToHeadSummary> {
  if (!isRealDataConfigured()) return summarizeHeadToHead([], teamAId, teamBId);
  const rows = await prisma.matchStatCache.findMany({
    where: {
      competitive: true,
      OR: [
        { teamId: teamAId, opponentId: teamBId },
        { teamId: teamBId, opponentId: teamAId },
      ],
    },
    orderBy: { date: "desc" },
    take: 20,
  });
  return summarizeHeadToHead(rows, teamAId, teamBId);
}
