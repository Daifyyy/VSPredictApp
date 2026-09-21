import { modelLabSummary, probabilityMetrics, type ModelLabLedgerRow } from "./modelLab";
import { resolvedStrategyOutcome } from "./strategyOutcome";
import type { DailyEvidence } from "./dailySelection";
import { localDateKey } from "../competitionGrouping";

export const dailyEvidenceCohortKey = (r: Pick<ModelLabLedgerRow,"strategy"|"market"|"policyVersion"|"modelVersion"|"modelContext"> & {contextVersion?:number;countModelVersion?:number|null}) =>
  JSON.stringify([r.strategy,r.market,r.policyVersion,r.modelVersion,r.modelContext,r.contextVersion??1,r.countModelVersion??null]);

/** Offline/settlement only. Exact versions; no history/bootstraps on a page read. */
export function buildDailyEvidence(rows: Array<ModelLabLedgerRow & {settledAt:Date|null;contextVersion?:number;countModelVersion?:number|null}>, cohortKey: string, cutoff: Date,
  approval: {cohortKey:string;at:Date} | null, research: boolean): DailyEvidence {
  const probability = (p:number) => Number.isFinite(p) && p>0 && p<1;
  const cohort=rows.filter(r=>dailyEvidenceCohortKey(r)===cohortKey &&
    r.qualifiedAt!=null && r.qualifiedAt<r.kickoff && r.kickoff<cutoff && r.settledAt!=null && r.settledAt<cutoff &&
    r.decimalOdds!=null && Number.isFinite(r.decimalOdds) && r.decimalOdds>=1.5 && r.decimalOdds<=3 &&
    probability(r.modelProbability) && probability(r.marketProbability) &&
    resolvedStrategyOutcome({storedHit:r.storedHit,market:r.market,side:r.side,line:r.line,homeGoals:r.homeGoals,awayGoals:r.awayGoals,actualCount:r.actualCount??null})!=null);
  const deduplicated = new Map<string, typeof cohort[number]>();
  for(const r of [...cohort].sort((a,b)=>a.qualifiedAt!.getTime()-b.qualifiedAt!.getTime()||a.id.localeCompare(b.id))) {
    const key=`${r.fixtureId}:${r.market}:${r.side}:${r.line}`;
    if(!deduplicated.has(key)) deduplicated.set(key,r);
  }
  const unique = [...deduplicated.values()];
  const v2=unique.filter(r=>r.clvMethodVersion===2).map(r=>{
    if(r.closedAt!=null && r.closedAt<cutoff) return r;
    return {...r,closingMarketProbability:null,closedAt:null,closingFreshness:null,closingBenchmarkQuality:null,priceClv:null,sameBookClv:null};
  });
  const summary=modelLabSummary(v2);
  const paired=unique.map(r=>({r,outcome:resolvedStrategyOutcome({storedHit:r.storedHit,market:r.market,side:r.side,line:r.line,homeGoals:r.homeGoals,awayGoals:r.awayGoals,actualCount:r.actualCount??null})!}));
  const model=probabilityMetrics(paired.map(({r,outcome})=>({probability:r.modelProbability,outcome})));
  const market=probabilityMetrics(paired.map(({r,outcome})=>({probability:r.marketProbability,outcome})));
  const days=new Set(unique.map(r=>localDateKey(r.kickoff))).size;
  const roi=unique.length?paired.reduce((sum,{r,outcome})=>sum+(outcome?r.decimalOdds!-1:-1),0)/unique.length:null;
  return {cohortKey,cutoff:cutoff.toISOString(),settledPriced:unique.length,
    numericalGatesPassed:v2.length>=200 && Object.values(summary.gates).every(Boolean),
    approvedAt:approval?.cohortKey===cohortKey && approval.at<cutoff ? approval.at.toISOString():null,research,
    performance:{days,pairedCount:unique.length,modelLogLoss:model.logLoss,marketLogLoss:market.logLoss,modelBrier:model.brier,marketBrier:market.brier,roi,
      supportsSamplePriority:unique.length>=50 && days>=10 && roi!=null && roi>0 && model.logLoss!=null && market.logLoss!=null && model.logLoss<=market.logLoss && model.brier!=null && market.brier!=null && model.brier<=market.brier}};
}
