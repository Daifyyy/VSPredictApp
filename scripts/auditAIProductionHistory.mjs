/** Read-only metadata audit. No raw snapshots, credentials, writes or provider calls. */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const fixtures = await prisma.fixturePrediction.groupBy({ by: ['leagueId', 'status'],
    where: { leagueId: { in: [39, 61, 78, 135, 140] } }, _count: true,
    _min: { kickoff: true }, _max: { kickoff: true } });
  console.log(JSON.stringify({ fixtures }));
} catch (error) {
  console.error(JSON.stringify({ status: 'UNAVAILABLE', code: error.code ?? error.name }));
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
