import { buildPerformancePressureShadow, type ExpectedMatchShape, type ExpectedMatchShapeSide, type ExpectedMetric, type PerformancePressureSide, type PressureContext } from "./performancePressureShadow";
import type { MetricValue } from "@/lib/types";

export const PERFORMANCE_PRESSURE_V4_VERSION=4;
export const PRESSURE_V4_ARTIFACT_VERSION=1;
export const PRESSURE_V4_ARTIFACT={
 LEAGUE:{openness:[18,21,24,27,30,34],interval:{shots:[5,7,9],sot:[2.5,3.5,4.5],box:[4,5.5,7],xg:[.8,1.15,1.55],corners:[2.8,3.8,5]}},
 EURO_CUP:{openness:[17,20,23,27,31,36],interval:{shots:[6,8,10],sot:[3,4,5],box:[4.5,6,8],xg:[.9,1.3,1.7],corners:[3,4.2,5.5]}},
 NATIONAL:{openness:[16,19,22,26,30,35],interval:{shots:[6,8.5,11],sot:[3,4.2,5.5],box:[4.5,6.5,8.5],xg:[.95,1.4,1.9],corners:[3.2,4.5,6]}},
} as const;
export interface PerformancePressureShadowV4 {
 version:4;method:"CALIBRATED_SHADOW_V4";artifactVersion:1;context:PressureContext;capturedAt:string;
 home:PerformancePressureSide;away:PerformancePressureSide;opennessScore:number;homePressurePercentile:number|null;awayPressurePercentile:number|null;
 currentTotalLambda:number;shotTotalLambda:number|null;blendedTotalLambda:number|null;currentOver25:number;shadowOver25:number|null;over25Delta:number|null;
 dependencyRisk:{weakerSide:"HOME"|"AWAY";weakerShare:number;probabilityOverWithoutWeakerSide:number;level:"LOW"|"MEDIUM"|"HIGH"};
 coverage:{available:number;expected:number;ratio:number};warnings:string[];expectedMatchShape:ExpectedMatchShape;
 calibration:{opennessBasis:"EXPECTED_TOTAL_SHOTS_PERCENTILE";dominanceBasis:"MULTI_SIGNAL_DANGER_SHARE";defenseProxy:"XG_AGAINST"};
}
const clamp=(v:number,min=0,max=1)=>Math.min(max,Math.max(min,v));
const round=(v:number,d=3)=>Number(v.toFixed(d));
const value=(values:MetricValue[],metric:string,venue:"HOME"|"AWAY")=>values.find(v=>v.metric===metric&&v.venue===venue)?.value??values.find(v=>v.metric===metric&&v.venue==="TOTAL")?.value??null;
const share=(a:number|null,b:number|null)=>a!=null&&b!=null&&a+b>0?a/(a+b):null;
function percentile(value:number,knots:readonly number[]){const scores=[1,15,35,60,82,97];if(value<=knots[0])return scores[0];for(let i=1;i<knots.length;i++)if(value<=knots[i])return round(scores[i-1]+(scores[i]-scores[i-1])*(value-knots[i-1])/(knots[i]-knots[i-1]),0);return 99}
function band(value:number,widths:readonly number[],min:number,max:number){const width=widths[value<10?0:value<18?1:2];return{low:round(clamp(value-width,min,max),1),high:round(clamp(value+width,min,max),1),level:.8 as const}}
function reviseIntervals(side:ExpectedMatchShapeSide,context:PressureContext){const a=PRESSURE_V4_ARTIFACT[context].interval;const metric=(m:ExpectedMetric,widths:readonly number[],max:number):ExpectedMetric=>m.value==null?m:{...m,interval:band(m.value,widths,0,max)};return{...side,shots:metric(side.shots,a.shots,36),shotsOnTarget:metric(side.shotsOnTarget,a.sot,16),shotsInsideBox:metric(side.shotsInsideBox,a.box,26),xg:metric(side.xg,a.xg,6),corners:metric(side.corners,a.corners,15)}}
function dangerShare(homeValues:MetricValue[],awayValues:MetricValue[],shape:ExpectedMatchShape){
 const weighted:Array<[number|null,number]>= [[share(shape.home.xg.value,shape.away.xg.value),.34],[share(shape.home.shotsOnTarget.value,shape.away.shotsOnTarget.value),.2],[share(shape.home.shotsInsideBox.value,shape.away.shotsInsideBox.value),.16],[share(shape.home.shots.value,shape.away.shots.value),.1],[share(value(homeValues,"POSSESSION","HOME"),value(awayValues,"POSSESSION","AWAY")),.08],[share(value(homeValues,"CORNERS","HOME"),value(awayValues,"CORNERS","AWAY")),.06],[share(value(awayValues,"XG_AGAINST","AWAY"),value(homeValues,"XG_AGAINST","HOME")),.06]];
 const present=weighted.filter((r):r is[number,number]=>r[0]!=null),weight=present.reduce((s,r)=>s+r[1],0);return weight?clamp(present.reduce((s,[v,w])=>s+v*w,0)/weight,.08,.92):.5;
}
export function buildPerformancePressureShadowV4(input:{homeValues:MetricValue[];awayValues:MetricValue[];currentLambdaHome:number;currentLambdaAway:number;currentOver25:number;context?:PressureContext;capturedAt?:Date}):PerformancePressureShadowV4{
 const context=input.context??"LEAGUE",base=buildPerformancePressureShadow(input),home=reviseIntervals(base.expectedMatchShape.home,context),away=reviseIntervals(base.expectedMatchShape.away,context),dominance=dangerShare(input.homeValues,input.awayValues,{...base.expectedMatchShape,home,away}),total=(home.shots.value??12)+(away.shots.value??12),openness=percentile(total,PRESSURE_V4_ARTIFACT[context].openness),weaker=dominance<=.5?"HOME":"AWAY",weakShare=Math.min(dominance,1-dominance);
 home.chanceShare={...home.chanceShare,value:round(dominance)};away.chanceShare={...away.chanceShare,value:round(1-dominance)};
 const dependencyLevel=weakShare>=.38?"HIGH":weakShare>=.28?"MEDIUM":"LOW";
 return{...base,version:4,method:"CALIBRATED_SHADOW_V4",artifactVersion:1,context,opennessScore:openness,expectedMatchShape:{...base.expectedMatchShape,home,away,openness,opennessLabel:openness<25?"LOW":openness<75?"NORMAL":openness<90?"HIGH":"EXTREME",weakerSide:weaker,weakerChanceShare:round(weakShare)},dependencyRisk:{...base.dependencyRisk,weakerSide:weaker,weakerShare:round(weakShare),level:dependencyLevel},calibration:{opennessBasis:"EXPECTED_TOTAL_SHOTS_PERCENTILE",dominanceBasis:"MULTI_SIGNAL_DANGER_SHARE",defenseProxy:"XG_AGAINST"}};
}
