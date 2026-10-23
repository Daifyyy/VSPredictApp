/** Explicit maintenance only. No provider calls and no Telegram distribution. */
import { prisma } from '../lib/db';
import { runAIResearch, readAIResearchDay } from '../lib/data/aiResearchStore';
import { resourceBudgetGuard } from '../lib/resourceBudgetGuard';
import { localDateKey } from '../lib/competitionGrouping';
import { AI_ARTIFACT_ID } from '../lib/picks/aiIdentity';
async function main() {
  if (process.argv.slice(2).join(' ') !== '--apply') throw Error('Use --apply for explicitly authorized immutable research capture');
  const limited = await resourceBudgetGuard('daily-selection');
  if (limited) { console.log(await limited.text()); return; }
  // Process-local switches only, not Vercel configuration. Never sends a message.
  process.env.AI_RESEARCH_INFERENCE_ENABLED = 'true';
  process.env.AI_RESEARCH_OPPORTUNITIES_ENABLED = 'true';
  process.env.AI_RESEARCH_TELEGRAM_ENABLED = 'false';
  const now = new Date();
  const first = await runAIResearch(now);
  const before = await prisma.aIForecastSnapshot.findMany({ where: { artifactId: AI_ARTIFACT_ID }, select: { fixtureId: true, capturedAt: true, probability: true, inputHash: true }, orderBy: { fixtureId: 'asc' } });
  const second = await runAIResearch(new Date());
  const after = await prisma.aIForecastSnapshot.findMany({ where: { artifactId: AI_ARTIFACT_ID }, select: { fixtureId: true, capturedAt: true, probability: true, inputHash: true }, orderBy: { fixtureId: 'asc' } });
  if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('AI_IDEMPOTENCY_CHECK_FAILED');
  const settlement = await runAIResearch(new Date(), true);
  const day = await readAIResearchDay(localDateKey(now));
  console.log(JSON.stringify({ first, second, immutableRows: after.length, settlement,
    projection: day ? { forecasts: day.forecasts.length, picks: day.picks.length, summary: day.summary } : null,
    telegramMessages: 0, providerCalls: 0 }));
}
main().catch(e => { console.error(e instanceof Error ? e.message.split('\n')[0] : 'FAILED'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
