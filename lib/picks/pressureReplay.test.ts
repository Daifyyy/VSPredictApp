import { describe, expect, it } from "vitest";
import { summarizePressureReplay, type PressureReplayObservation } from "./pressureReplay";

function row(fixtureId:number,openness:number,expected:number,actual:number,side:"HOME"|"AWAY"):PressureReplayObservation{
 return{fixtureId,date:new Date(2025,0,fixtureId).toISOString(),context:"LEAGUE",fidelity:"PARTIAL",side,expected:{shots:expected},actual:{shots:actual},intervals:{shots:{low:actual-1,high:actual+1}},openness,expectedChanceShare:side==="HOME"?.6:.4,actualChanceShare:side==="HOME"?.62:.38,expectedWeaker:side==="AWAY",actualContributionShare:side==="HOME"?.62:.38,historicalTeamShots:expected+3,contextShots:12,reconstructedV2Shots:expected+4,sample:10};
}
describe("summarizePressureReplay",()=>{
 it("measures accuracy, interval coverage and monotonic openness without changing predictions",()=>{const rows:PressureReplayObservation[]=[];for(let i=1;i<=240;i++){const tier=i<=80?0:i<=160?1:2,openness=[20,50,80][tier],homeExpected=[9,12,16][tier],awayExpected=[8,10,14][tier];rows.push(row(i,openness,homeExpected,homeExpected+1,"HOME"),row(i,openness,awayExpected,awayExpected+1,"AWAY"))}const report=summarizePressureReplay(rows,new Date("2026-01-01T00:00:00Z"));expect(report.fixtureCount).toBe(240);expect(report.metrics[0].coverage80).toBe(1);expect(report.opennessMonotonic).toBe(true);expect(report.shotBenchmarks.v3Mae).toBeLessThan(report.shotBenchmarks.teamMeanMae!);expect(report.leakageViolations).toBe(0)});
 it("does not claim success for a small sample",()=>{const report=summarizePressureReplay([row(1,50,12,12,"HOME"),row(1,50,10,10,"AWAY")]);expect(report.verdict).toBe("INSUFFICIENT_DATA")});
});
