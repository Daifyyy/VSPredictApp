import { describe,expect,it } from "vitest";
import { dailyBalance, settleDailyMarket } from "./dailySelectionSettlement";
const base={status:"FT",home:2,away:1,identityValid:true};
describe("daily selection settlement",()=>{
  it.each([
    [JSON.stringify(["1X2","HOME",null]),"WON"],
    [JSON.stringify(["OVER_25","OVER",2.5]),"WON"],
    [JSON.stringify(["BTTS","UNDER",null]),"LOST"],
    [JSON.stringify(["TEAM_HOME_15","OVER",1.5]),"WON"],
    [JSON.stringify(["RESULT_TOTAL","HOME","UNDER",4.5]),"WON"],
    [JSON.stringify(["RESULT_TOTAL","AWAY","UNDER",4.5]),"LOST"],
  ])("settles exact market %s",(marketKey,outcome)=>expect(settleDailyMarket({...base,marketKey})).toBe(outcome));
  it("never manufactures zero count statistics",()=>{
    const marketKey=JSON.stringify(["FOULS","OVER",20.5]);
    expect(settleDailyMarket({...base,marketKey})).toBe("PENDING");
    expect(settleDailyMarket({...base,marketKey,actualCount:24})).toBe("WON");
  });
  it("distinguishes void, postponement and changed identity",()=>{
    const input={...base,marketKey:JSON.stringify(["CORNERS","OVER",10])};
    expect(settleDailyMarket({...input,actualCount:10})).toBe("VOID");
    expect(settleDailyMarket({...input,status:"PST"})).toBe("PENDING");
    expect(settleDailyMarket({...input,status:"CANC"})).toBe("VOID");
    expect(settleDailyMarket({...input,identityValid:false})).toBe("UNEVALUABLE");
  });
  it("keeps a withdrawn loss in the original cohort; void/pending are not ROI bets",()=>{
    const b=dailyBalance([{outcome:"LOST",profit:-1,decimalOdds:2},{outcome:"WON",profit:1,decimalOdds:2},{outcome:"VOID",profit:0,decimalOdds:2},{outcome:"PENDING",profit:null,decimalOdds:2},{outcome:"UNEVALUABLE",profit:null,decimalOdds:2}]);
    expect(b).toMatchObject({published:5,won:1,lost:1,roi:0,profit:0,hitRate:.5,void:1,pending:1,unevaluable:1});
  });
});
