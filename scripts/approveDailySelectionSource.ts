// Explicit human operation; not called by any cron. Does not bypass numerical gates.
// node --env-file=.env --import ./scripts/registerServerOnly.mjs --import tsx scripts/approveDailySelectionSource.ts '<cohort JSON>' '<reviewer>'
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { refreshDailyAutonomousEvidence } from "../lib/data/dailySelectionEvidenceStore";
async function main(){
  const [key,reviewer]=process.argv.slice(2);
  if(!key||!reviewer)throw new Error("Provide exact cohort JSON and reviewer identity");
  const [strategy,,policyVersion,modelVersion,modelContext]=JSON.parse(key);
  const {summaries}=await refreshDailyAutonomousEvidence(new Date(),false);
  const evidence=summaries.find(e=>e.cohortKey===key);
  if(!evidence?.numericalGatesPassed||evidence.research)throw new Error("Exact source has not passed shared validation gates or is research");
  await prisma.$transaction(async tx=>{
    const definition=await tx.modelStrategyDefinition.findUniqueOrThrow({where:{strategy_policyVersion_modelContext_modelVersion:{strategy,policyVersion,modelContext,modelVersion}}});
    const criteria=definition.decisionCriteria as Record<string,Prisma.JsonValue>;
    const previous=Array.isArray(criteria.dailySelectionApprovals)?criteria.dailySelectionApprovals:[];
    const approval={cohortKey:key,at:new Date().toISOString(),approvedBy:reviewer};
    await tx.modelStrategyDefinition.update({where:{id:definition.id},data:{decisionCriteria:{...criteria,dailySelectionApprovals:[...previous,approval]} as Prisma.InputJsonValue}});
    await tx.modelStrategyStatusAudit.create({data:{definitionId:definition.id,fromStatus:definition.status,toStatus:definition.status,changedBy:reviewer,reason:`Daily Selection manual approval: ${key}`}});
  });
  await refreshDailyAutonomousEvidence(new Date(),true);
  console.log("Exact source approved; selector remains unverified.");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
