/** Read-only live parity/readiness check. No inference is persisted or distributed. */
import { PrismaClient } from '@prisma/client';
import { buildAIBaseForecasts, AI_LEAGUES, AI_ACTIVE_SEASON } from '../lib/picks/aiProduction';
const db = new PrismaClient();
async function main() {
try {
  const now = new Date();
  const history = await db.fixturePrediction.findMany({ where: { leagueId: { in: AI_LEAGUES }, season: AI_ACTIVE_SEASON },
    select: { fixtureId: true, leagueId: true, season: true, homeTeamId: true, awayTeamId: true, kickoff: true, status: true, homeGoals: true, awayGoals: true, available: true, modelContext: true } });
  const targets = history.filter(r => r.status === 'NS' && +r.kickoff > +now && +r.kickoff <= +now + 2 * 86400_000);
  const started = performance.now();
  const result = buildAIBaseForecasts(history, targets, now);
  console.log(JSON.stringify({ rows: history.length, targets: targets.length, predicted: result.output.length,
    rejected: result.rejected, durationMs: performance.now() - started,
    probabilities: result.output.map(p => ({ fixtureId: p.fixtureId, p: p.probability, coverage: p.coverage })) }));
} catch (e) { console.error(e instanceof Error ? e.message.split('\n')[0] : 'AUDIT_FAILED'); process.exitCode = 1; }
finally { await db.$disconnect(); }
}
void main();
