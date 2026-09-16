import { describe, expect, it } from "vitest";
import { diagnoseMatchFlow, evaluateMatchFlow, type MatchFlowComponent } from "./matchFlowEvaluation";
import { buildPerformancePressureShadow } from "./performancePressureShadow";
import type { MetricValue, Metric, Venue } from "@/lib/types";
const mv=(metric:Metric,venue:Venue,value:number):MetricValue=>({metric,venue,value,sampleSize:12,lowConfidence:false,breakdown:[]});
const profile=(venue:Venue,xg:number)=>[mv("SHOTS",venue,12),mv("SHOTS_ON_TARGET",venue,4),mv("SHOTS_INSIDE_BOX",venue,7),mv("XG",venue,xg),mv("XG_AGAINST",venue,1.3),mv("GOALS_AGAINST",venue,1.2),mv("POSSESSION",venue,52),mv("CORNERS",venue,5)];
const pressure=buildPerformancePressureShadow({homeValues:profile("HOME",1.6),awayValues:profile("AWAY",1.1),currentLambdaHome:1.6,currentLambdaAway:1.1,currentOver25:.52});
describe("match flow evaluation",()=>{
  it("withholds a verdict before minute 15",()=>{const r=evaluateMatchFlow({pressure,minute:10,home:{XG:.2},away:{XG:.1}});expect(r.verdict).toBe("NEDOSTATEK_DAT");expect(r.diagnosis.code).toBe("INSUFFICIENT_DATA")});
  it("separates a finishing miss from a correctly shaped match",()=>{const r=evaluateMatchFlow({pressure,minute:90,final:true,home:{XG:1.6,SHOTS:12,SHOTS_ON_TARGET:4,SHOTS_INSIDE_BOX:7},away:{XG:1.1,SHOTS:11,SHOTS_ON_TARGET:4,SHOTS_INSIDE_BOX:6},goals:{home:4,away:1}});expect(r.components.find(x=>x.key==="FINISHING")?.verdict).toBe("NETREFENO");expect(r.verdict).not.toBe("NETREFENO");expect(r.diagnosis.code).toBe("CORRECT_FLOW_BAD_FINISHING")});
  it("marks a reversed dominance",()=>{const r=evaluateMatchFlow({pressure,minute:90,final:true,home:{XG:.3,SHOTS_ON_TARGET:1},away:{XG:2.2,SHOTS_ON_TARGET:7},goals:{home:0,away:2}});expect(r.components.find(x=>x.key==="DOMINANCE")?.verdict).toBe("NETREFENO");expect(r.diagnosis.code).toBe("WRONG_DOMINANCE")});
  it("gives structural changes priority over every statistical miss",()=>{const r=evaluateMatchFlow({pressure,minute:90,final:true,redCards:1,home:{XG:.2,SHOTS_ON_TARGET:1},away:{XG:3,SHOTS_ON_TARGET:9},goals:{home:0,away:3}});expect(r.diagnosis.code).toBe("STRUCTURAL_CHANGE")});
  it("uses the documented deterministic diagnosis order",()=>{
    const component=(key:MatchFlowComponent["key"],verdict:MatchFlowComponent["verdict"],difference=0):MatchFlowComponent=>({key,verdict,label:key,detail:"",expected:1,actual:1+difference,difference,source:"test"});
    expect(diagnoseMatchFlow({verdict:"NETREFENO",structurallyChanged:false,components:[component("PACE","NETREFENO"),component("CHANCE_CREATION","NETREFENO")]}).code).toBe("WRONG_PACE");
    expect(diagnoseMatchFlow({verdict:"NETREFENO",structurallyChanged:false,components:[component("WEAKER_SIDE","NETREFENO",-.3),component("CHANCE_CREATION","NETREFENO")]}).code).toBe("WEAKER_SIDE_ABSENT");
    expect(diagnoseMatchFlow({verdict:"NETREFENO",structurallyChanged:false,components:[component("CHANCE_CREATION","NETREFENO")]}).code).toBe("CHANCE_CREATION_MISS");
    expect(diagnoseMatchFlow({verdict:"TREFENO",structurallyChanged:false,components:[]}).code).toBe("FLOW_CONFIRMED");
    expect(diagnoseMatchFlow({verdict:"CASTECNE",structurallyChanged:false,components:[]}).code).toBe("PARTIAL_MATCH");
  });
});
