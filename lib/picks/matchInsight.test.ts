import { describe, expect, it } from "vitest";
import type { Metric, MetricValue, Venue } from "@/lib/types";
import { buildPerformancePressureShadow } from "./performancePressureShadow";
import { buildMatchInsight, publicMatchInsight } from "./matchInsight";
import { evaluateMatchFlow } from "./matchFlowEvaluation";

const metric=(name:Metric,venue:Venue,value:number):MetricValue=>({metric:name,venue,value,sampleSize:12,lowConfidence:false,breakdown:[]});
const profile=(venue:Venue,xg:number)=>[metric("SHOTS",venue,12),metric("SHOTS_ON_TARGET",venue,4),metric("SHOTS_INSIDE_BOX",venue,7),metric("XG",venue,xg),metric("XG_AGAINST",venue,1.2),metric("GOALS_AGAINST",venue,1.1),metric("POSSESSION",venue,52),metric("CORNERS",venue,5)];
const pressure=buildPerformancePressureShadow({homeValues:profile("HOME",1.5),awayValues:profile("AWAY",1.1),currentLambdaHome:1.5,currentLambdaAway:1.1,currentOver25:.51,capturedAt:new Date("2026-09-16T10:00:00Z")});

describe("MatchInsight",()=>{
  it("normalizes pre-match and final views through one contract",()=>{
    const pre=buildMatchInsight({pressure,phase:"PREMATCH"});
    const evaluation=evaluateMatchFlow({pressure,minute:90,final:true,home:{XG:1.5,SHOTS:12,SHOTS_ON_TARGET:4},away:{XG:1.1,SHOTS:10,SHOTS_ON_TARGET:3},goals:{home:1,away:1}});
    const final=buildMatchInsight({pressure,evaluation,phase:"FINAL"});
    expect(pre.version).toBe(final.version);
    expect(final.publicSummary.diagnosis?.code).toBe(evaluation.diagnosis.code);
    expect(final.evaluation).toEqual(evaluation);
  });
  it("keeps the public explanation but strips every PRO diagnostic payload",()=>{
    const publicView=publicMatchInsight(buildMatchInsight({pressure,phase:"PREMATCH"}));
    expect(publicView.publicSummary.text.length).toBeGreaterThan(0);
    expect(publicView.expectation).toBeNull();
    expect(publicView.technical).toBeNull();
    expect(publicView.evaluation).toBeNull();
    expect(publicView.publicSummary.diagnosis).toBeNull();
    expect(publicView.coverage).toBeNull();
    expect(publicView.confidence).toBeNull();
  });
});
