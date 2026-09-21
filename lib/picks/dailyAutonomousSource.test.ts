import {describe,it,expect} from "vitest";
import {dailyAutonomousCandidate,type DailyFixtureQuote,type DailyAutonomousRow} from "./dailyAutonomousSource";
const now=new Date("2026-09-21T07:00:00Z");
const row:DailyAutonomousRow={id:"1",fixtureId:1,leagueId:39,homeTeamId:10,awayTeamId:20,homeName:"A",awayName:"B",kickoff:new Date("2026-09-21T18:00:00Z"),strategy:"OVER_25",policyVersion:2,status:"candidate",qualifiedAt:new Date("2026-09-21T06:00:00Z"),market:"OVER_25",side:"OVER",line:2.5,modelVersion:7,modelContext:"LEAGUE",contextVersion:1,countModelVersion:null,modelProbability:.66,modelInputSnapshot:{readinessSample:9},sampleCount:3};
const fixture:DailyFixtureQuote={fixtureId:1,leagueId:39,homeTeamId:10,awayTeamId:20,homeName:"A",awayName:"B",kickoff:row.kickoff,status:"NS",available:true,modelVersion:7,modelContext:"LEAGUE",contextVersion:1,oddsCurrentAt:now,oddsCurrentBooks:[{id:4,name:"Pinnacle",over25:1.8,under25:2.1}],lowConfidence:false,readinessSample:9,homeWin:.5,draw:.25,awayWin:.25,countModelVersion:null,foulModelVersion:null};
describe("daily autonomous source",()=>{
  it("uses an exact current quote and preserves original probability",()=>{
    const c=dailyAutonomousCandidate({...row,modelProbability:.65},fixture,null,now).candidate!;
    expect(c.odds).toBe(1.8);expect(c.modelProbability).toBe(.65);expect(c.marketProbability).toBeCloseTo((1/1.8)/(1/1.8+1/2.1));
  });
  it("rejects stale policy, changed fixture identity and missing original readiness",()=>{
    expect(dailyAutonomousCandidate({...row,policyVersion:1},fixture,null,now).candidate).toBeNull();
    expect(dailyAutonomousCandidate(row,{...fixture,homeTeamId:20},null,now).candidate).toBeNull();
    expect(dailyAutonomousCandidate({...row,modelInputSnapshot:null},fixture,null,now).candidate).toBeNull();
  });
  it("requalifies at the new price rather than carrying forward historical EV",()=>{
    expect(dailyAutonomousCandidate(row,{...fixture,oddsCurrentBooks:[{id:4,name:"Pinnacle",over25:1.5,under25:2.4}]},null,now).reason).toBe("CURRENT_PRICE_SOURCE_REJECTED");
  });
  it("cannot invent a benchmark from a price without its opposing selection",()=>{
    expect(dailyAutonomousCandidate(row,{...fixture,oddsCurrentBooks:[{id:4,name:"Pinnacle",over25:1.8}]},null,now).reason).toBe("MISSING_COMPARABLE_QUOTE");
  });
});
