import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';
import { prisma } from '@/lib/db';
import { buildLiveSchedule } from '@/lib/liveSchedule';

export const maxDuration = 15;
export async function GET(request: Request) {
  const denied = await requireCronAuth(request);
  if (denied) return denied;
  const now = new Date();
  const fixtures = await prisma.fixturePrediction.findMany({
    where: { kickoff: { gt: new Date(+now - 4 * 3600_000), lt: new Date(+now + 26 * 3600_000) } },
    select: { kickoff: true, status: true }, take: 1001, orderBy: { kickoff: 'asc' },
  });
  // Truncation must not pretend the program is complete; hourly fallback remains available.
  if (fixtures.length > 1000) return NextResponse.json({ error: 'SCHEDULE_CAPACITY_EXCEEDED' }, { status: 503 });
  return NextResponse.json(buildLiveSchedule(fixtures, now), { headers: { 'Cache-Control': 'private, no-store' } });
}
