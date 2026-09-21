import { expect, it } from "vitest";
import { buildDailyEvidence, dailyEvidenceCohortKey } from "./dailySelectionEvidence";
import type { ModelLabLedgerRow } from "./modelLab";
it("does not borrow sample size or approval from another exact cohort",()=>{
  const row:ModelLabLedgerRow={id:"1",fixtureId:1,leagueId:39,kickoff:new Date("2026-09-19T12:00:00Z"),strategy:"OVER_25",policyVersion:2,market:"OVER_25",side:"OVER",line:2.5,modelProbability:.6,marketProbability:.5,decimalOdds:2,stake:1,modelContext:"LEAGUE",modelVersion:7,qualifiedAt:new Date("2026-09-19T10:00:00Z"),closingMarketProbability:null,closedAt:null,homeGoals:2,awayGoals:1,clvMethodVersion:2};
  const key=dailyEvidenceCohortKey(row),cutoff=new Date("2026-09-20T00:00:00Z");
  const result=buildDailyEvidence([row,{...row,id:"2",modelVersion:8},{...row,id:"3",clvMethodVersion:1},{...row,id:"4",marketProbability:NaN}].map(r=>({...r,settledAt:new Date("2026-09-19T15:00:00Z")})),key,cutoff,{cohortKey:"wrong",at:new Date("2026-09-01")},false);
  expect(result.settledPriced).toBe(1);
  expect(result.numericalGatesPassed).toBe(false);
  expect(result.approvedAt).toBeNull();
});

it("separates context and count model versions",()=>{
  const base={strategy:"CORNERS",market:"CORNERS",policyVersion:1,modelVersion:7,modelContext:"LEAGUE"};
  expect(dailyEvidenceCohortKey({...base,countModelVersion:1})).not.toBe(dailyEvidenceCohortKey({...base,countModelVersion:2}));
  expect(dailyEvidenceCohortKey({...base,contextVersion:1})).not.toBe(dailyEvidenceCohortKey({...base,contextVersion:2}));
});

it("ignores settlements after cutoff and respects frozen outcomes",()=>{
  const cutoff=new Date("2026-09-20T00:00:00Z");
  const row:ModelLabLedgerRow & {settledAt:Date}={id:"1",fixtureId:1,leagueId:39,kickoff:new Date("2026-09-19T12:00:00Z"),strategy:"OVER_25",policyVersion:2,market:"OVER_25",side:"OVER",line:2.5,modelProbability:.6,marketProbability:.5,decimalOdds:2,stake:1,modelContext:"LEAGUE",modelVersion:7,qualifiedAt:new Date("2026-09-19T10:00:00Z"),closingMarketProbability:null,closedAt:null,homeGoals:0,awayGoals:0,storedHit:true,clvMethodVersion:2,settledAt:new Date("2026-09-19T15:00:00Z")};
  const key=dailyEvidenceCohortKey(row);
  const result=buildDailyEvidence([row,{...row,id:"2",fixtureId:2,settledAt:cutoff}],key,cutoff,null,false);
  expect(result.settledPriced).toBe(1);
  expect(result.performance?.roi).toBe(1);
  expect(result.performance?.supportsSamplePriority).toBe(false);
});
