import 'server-only';
import { prisma } from '../db';
import { fetchFixturesByIds } from './apiFootball';
import { settleLiveCandidates } from './liveCenterStore';

/** Drain old candidates only. Never collect new live statistics, prices or tips. */
export async function settleLegacyLiveCandidates() {
  const rows = await prisma.liveCandidateSnapshot.findMany({
    where: { settlementStatus: 'PENDING', kickoff: { lt: new Date(Date.now() - 3 * 3600_000) } },
    select: { fixtureId: true }, distinct: ['fixtureId'], take: 20, orderBy: { kickoff: 'asc' },
  });
  if (!rows.length) return 0;
  const fixtures = await fetchFixturesByIds(rows.map(row => row.fixtureId));
  let settled = 0;
  for (const fixture of fixtures) {
    if (['FT', 'AET', 'PEN'].includes(fixture.fixture.status.short)) settled += await settleLiveCandidates(fixture);
  }
  return settled;
}
