import { describe, expect, it } from "vitest";
import type { Metric, MetricValue, Venue } from "@/lib/types";
import { buildPerformancePressureShadow } from "./performancePressureShadow";
const mv=(metric:Metric,venue:Venue,value:number,sampleSize=10):MetricValue=>({metric,venue,value,sampleSize,lowConfidence:false,breakdown:[]});
const profile=(venue:Venue,xg:number,xga:number)=>[mv("SHOTS",venue,14),mv("SHOTS_ON_TARGET",venue,5),mv("SHOTS_INSIDE_BOX",venue,8),mv("XG",venue,xg),mv("XG_AGAINST",venue,xga),mv("GOALS_AGAINST",venue,xga),mv("POSSESSION",venue,54),mv("CORNERS",venue,5.5)];
describe("performance pressure shadow v2",()=>{
  it("freezes a coherent expected match shape",()=>{const r=buildPerformancePressureShadow({homeValues:profile("HOME",1.8,1.1),awayValues:profile("AWAY",1.4,1.6),currentLambdaHome:1.7,currentLambdaAway:1.2,currentOver25:.58});expect(r.version).toBe(2);expect(r.currentOver25).toBe(.58);expect(r.expectedMatchShape.home.shots.value).toBeGreaterThan(0);expect(r.expectedMatchShape.home.chanceShare.value!+r.expectedMatchShape.away.chanceShare.value!).toBeCloseTo(1);expect(r.coverage.ratio).toBe(1)});
  it("does not invent missing team shot rates",()=>{const r=buildPerformancePressureShadow({homeValues:[mv("XG","HOME",1.2)],awayValues:[mv("XG_AGAINST","AWAY",1.3)],currentLambdaHome:1,currentLambdaAway:1,currentOver25:.4});expect(r.coverage.ratio).toBeLessThan(.5);expect(r.expectedMatchShape.home.shots.value).toBeNull();expect(r.expectedMatchShape.home.xg.confidence).toBeLessThan(.5)});
  it("shows dependency on the weaker side",()=>{const r=buildPerformancePressureShadow({homeValues:profile("HOME",1.2,1.2),awayValues:profile("AWAY",1.8,1.2),currentLambdaHome:1.25,currentLambdaAway:1.99,currentOver25:.63});expect(r.dependencyRisk.weakerSide).toBe("HOME");expect(r.dependencyRisk.level).not.toBe("LOW")});
});
