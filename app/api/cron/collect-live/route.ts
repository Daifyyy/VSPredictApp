import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { fetchFixturesByIds, fetchLiveFixtures } from "@/lib/data/apiFootball";
import { ACTIVE_PROGRAM_CLUB_LEAGUE_IDS, EURO_LEAGUE_IDS } from "@/lib/data/catalog";
import { captureLiveFixture, settleLiveCandidates } from "@/lib/data/liveCenterStore";
import { prisma } from "@/lib/db";
import { withCronRun } from "@/lib/operations";
import { cronJson } from "@/lib/cronResult";
import { logError } from "@/lib/logError";
import { sendLiveCandidateNotifications } from "@/lib/push";

export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCronAuth(req); if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const limit = Math.max(1, Math.min(3, Number(params.get("limit")) || 2));
  const offset = Math.max(0, Number(params.get("cursor")) || 0);
  try {
    const result = await withCronRun("collect-live", async () => {
      await prisma.liveFixtureWatch.deleteMany({ where: { expiresAt: { lte: new Date() } } });
      const live = (await fetchLiveFixtures([...ACTIVE_PROGRAM_CLUB_LEAGUE_IDS, ...EURO_LEAGUE_IDS])).sort((a, b) => a.fixture.id - b.fixture.id);
      const watched = new Set((await prisma.liveFixtureWatch.findMany({ where: { expiresAt: { gt: new Date() } }, select: { fixtureId: true } })).map((row) => row.fixtureId));
      const ordered = [...live.filter((row) => watched.has(row.fixture.id)), ...live.filter((row) => !watched.has(row.fixture.id))];
      const batch = ordered.slice(offset, offset + limit);
      let processed = 0, errors = 0, apiCalls = 1;
      const candidates = [];
      for (const fixture of batch) try { const captured = await captureLiveFixture(fixture); candidates.push(...captured.candidates); processed++; apiCalls += 4; } catch (error) { errors++; logError("cron/collect-live.fixture", error, { fixtureId: fixture.fixture.id }); }
      const push = await sendLiveCandidateNotifications(candidates);
      const pending = await prisma.liveCandidateSnapshot.findMany({ where: { settlementStatus: "PENDING", kickoff: { lt: new Date(Date.now() - 2 * 60 * 60_000) } }, select: { fixtureId: true }, distinct: ["fixtureId"], take: 20 });
      if (pending.length) {
        const fixtures = await fetchFixturesByIds(pending.map((row) => row.fixtureId)); apiCalls++;
        for (const fixture of fixtures) await settleLiveCandidates(fixture);
      }
      const nextOffset = offset + batch.length;
      return { candidates: live.length, processed, errors, apiCalls, remaining: Math.max(0, ordered.length - nextOffset), cursor: nextOffset < ordered.length ? String(nextOffset) : null, push };
    });
    return cronJson("cron/collect-live", result, result.errors, result.processed);
  } catch (error) {
    logError("cron/collect-live", error);
    return NextResponse.json({ error: "Live sběr selhal" }, { status: 502 });
  }
}
