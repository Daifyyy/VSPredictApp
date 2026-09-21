import { describe, expect, it } from "vitest";
import { dailyCandidateRejection, selectDailyCandidates, type DailyCandidate } from "./dailySelection";
const now = new Date("2026-09-21T07:00:00Z");
const make = (n=1, patch: Partial<DailyCandidate> = {}): DailyCandidate => ({
  id:String(n),sourceIds:[String(n)],cohortKey:"OVER:2:7:LEAGUE",fixtureId:n,leagueId:n,
  kickoff:"2026-09-21T18:00:00Z",marketKey:"GOALS:OVER:2.5",odds:1.8,bookmaker:"Book",oddsAt:now.toISOString(),
  priceKind:"DIRECT",qualified:true,currentPriceQualified:true,identityValid:true,blocked:false,warnings:[],
  marketProbability:.6,benchmarkComparable:true,modelProbability:.65,probabilityKind:"MAIN",evidence:null,...patch,
});
describe("daily selection policy v1",()=>{
  it("accepts inclusive boundaries",()=>{
    for(const odds of [1.5,3]) expect(dailyCandidateRejection(make(1,{odds,oddsAt:"2026-09-21T05:30:00Z",kickoff:"2026-09-21T07:30:00Z"}),now)).toBeNull();
  });
  it.each([
    {odds:3.01},{odds:NaN},{priceKind:"SYNTHETIC" as const},{oddsAt:"2026-09-21T05:29:59Z"},
    {oddsAt:"2026-09-21T07:00:01Z"},{kickoff:"2026-09-21T07:29:59Z"},{bookmaker:""},
    {identityValid:false},{blocked:true},{qualified:false},{currentPriceQualified:false},
  ])("rejects invalid source/price %j",patch=>expect(dailyCandidateRejection(make(1,patch),now)).not.toBeNull());
  it("never fills with failing candidates or exceeds limits",()=>{
    const candidates=Array.from({length:12},(_,i)=>make(i+1,{leagueId:i<6?1:i}));
    const result=selectDailyCandidates(candidates,[],now);
    expect(result.selected).toHaveLength(5);
    expect(result.selected.filter(x=>x.leagueId===1)).toHaveLength(2);
    expect(selectDailyCandidates([make(1,{blocked:true})],[],now).selected).toEqual([]);
  });
  it("retains source references without counting duplicates",()=>{
    const result=selectDailyCandidates([make(),make(2,{fixtureId:1}),make(3,{fixtureId:1,marketKey:"BTTS:YES"})],[],now);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].sourceIds).toEqual(["1","2"]);
  });
  it("existing withdrawn entries still consume slots",()=>{
    const existing=Array.from({length:5},(_,i)=>({fixtureId:i+10,leagueId:i+10}));
    expect(selectDailyCandidates([make()],existing,now).selected).toEqual([]);
  });
  it("requires matching past evidence and approval; research never documented",()=>{
    const evidence={cohortKey:make().cohortKey,cutoff:"2026-09-21T06:00:00Z",settledPriced:200,numericalGatesPassed:true,approvedAt:"2026-09-20T00:00:00Z",research:false};
    const tier=(e:typeof evidence)=>selectDailyCandidates([make(1,{evidence:e})],[],now).selected[0].tier;
    expect(tier(evidence)).toBe("DOCUMENTED_SOURCE");
    expect(tier({...evidence,research:true})).toBe("UNVERIFIED");
    expect(tier({...evidence,cohortKey:"OTHER"})).toBe("UNVERIFIED");
    expect(tier({...evidence,cutoff:now.toISOString()})).toBe("UNVERIFIED");
    expect(tier({...evidence,settledPriced:199})).toBe("UNVERIFIED");
  });
  it("is permutation invariant with incomparable model families",()=>{
    const candidates=[make(1,{modelProbability:.9}),make(2,{probabilityKind:"ELO"}),make(3,{modelProbability:.7})];
    const ids=(xs:DailyCandidate[])=>selectDailyCandidates(xs,[],now).selected.map(x=>x.id);
    expect(ids(candidates)).toEqual(ids([...candidates].reverse()));
    expect(ids(candidates)).toEqual(["1","2","3"]);
  });
  it("does not mistake inverse combination odds for a fair benchmark",()=>{
    const result=selectDailyCandidates([make(1,{marketProbability:.9,benchmarkComparable:false}),make(2)],[],now);
    expect(result.selected[0].id).toBe("2");
  });
  it("does not reward a large losing sample over a clean unknown source",()=>{
    const evidence={cohortKey:make().cohortKey,cutoff:"2026-09-21T06:00:00Z",settledPriced:500,numericalGatesPassed:false,approvedAt:null,research:false,
      performance:{days:40,pairedCount:500,modelLogLoss:.8,marketLogLoss:.65,modelBrier:.3,marketBrier:.24,roi:-.2,supportsSamplePriority:false}};
    const result=selectDailyCandidates([make(1,{evidence}),make(2)],[],now);
    expect(result.selected[0].id).toBe("2");
    expect(result.selected[1].evidenceBand).toBe(0);
    expect(result.selected[1].warnings).toContain("SOURCE_TRAILS_MARKET_SMALL_SAMPLE_NOT_PROOF");
  });
});
