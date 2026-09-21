// Explicit diagnostic: no writes, no inference, no provider requests.
// node --env-file=.env --import ./scripts/registerServerOnly.mjs --import tsx scripts/dryRunDailySelection.ts
import { prisma } from "../lib/db";
import { localDateKey } from "../lib/competitionGrouping";
import { loadDailySources } from "../lib/data/dailySelectionPipeline";
import { refreshDailyAutonomousEvidence } from "../lib/data/dailySelectionEvidenceStore";
import { selectDailyCandidates } from "../lib/picks/dailySelection";

async function main(){
  const now=new Date(),date=localDateKey(now);
  const sources=await loadDailySources(date,now);
  const {summaries:evidence,rejected:evidenceRejections}=await refreshDailyAutonomousEvidence(new Date(now.getTime()-1),false);
  const byKey=new Map(evidence.map(e=>[e.cohortKey,e]));
  const candidates=sources.candidates.map(c=>({...c,evidence:byKey.get(c.cohortKey)??null}));
  // Standalone preview, not a claim that a whole-day historical portfolio was published.
  const existing=await prisma.dailySelectionDay.findUnique({where:{dateKey:date},include:{items:true}});
  console.log(JSON.stringify({mode:"ALL_SOURCES_DRY_RUN_NO_WRITES",at:now,sourceRejections:sources.rejected,evidenceRejections,evidence,...selectDailyCandidates(candidates,existing?.items??[],now)},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
