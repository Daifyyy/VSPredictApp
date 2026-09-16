import type { ExpectedMatchShape, ExpectedMetric, PerformancePressureShadow } from "./performancePressureShadow";

export const MATCH_FLOW_EVALUATION_VERSION = 3;
export type MatchFlowVerdict = "TREFENO" | "CASTECNE" | "NETREFENO" | "NEDOSTATEK_DAT";
export type MatchFlowDiagnosisCode = "FLOW_CONFIRMED" | "CORRECT_FLOW_BAD_FINISHING" | "WRONG_DOMINANCE" | "WRONG_PACE" | "CHANCE_CREATION_MISS" | "WEAKER_SIDE_ABSENT" | "STRUCTURAL_CHANGE" | "PARTIAL_MATCH" | "INSUFFICIENT_DATA";
export type FlowStats = Partial<Record<"XG"|"SHOTS"|"SHOTS_ON_TARGET"|"SHOTS_INSIDE_BOX"|"CORNERS"|"POSSESSION",number>>;
export interface MatchFlowComponent { key:"DOMINANCE"|"PACE"|"CHANCE_CREATION"|"WEAKER_SIDE"|"FINISHING"; verdict:MatchFlowVerdict; label:string; detail:string; expected:number|null; actual:number|null; difference:number|null; source:string|null }
export interface MatchFlowDiagnosis { code:MatchFlowDiagnosisCode; label:string; summary:string }
export interface MatchFlowEvaluation { version:3; pressureVersion:number; minute:number; final:boolean; verdict:MatchFlowVerdict; headline:string; diagnosis:MatchFlowDiagnosis; strongestMatch:string|null; largestMiss:string|null; coverage:number; structurallyChanged:boolean; warnings:string[]; components:MatchFlowComponent[] }
type MetricKey="xg"|"shots"|"shotsOnTarget"|"shotsInsideBox"|"corners"|"possession";
const fields={xg:"XG",shots:"SHOTS",shotsOnTarget:"SHOTS_ON_TARGET",shotsInsideBox:"SHOTS_INSIDE_BOX",corners:"CORNERS",possession:"POSSESSION"} as const;
const round=(v:number,d=2)=>Number(v.toFixed(d));
const value=(s:FlowStats,k:MetricKey)=>s[fields[k]]??null;
const total=(a:number|null,b:number|null)=>a==null&&b==null?null:(a??0)+(b??0);
const share=(a:number|null,b:number|null)=>{const t=total(a,b);return t!=null&&t>0?(a??0)/t:null};
const grade=(error:number,good:number,partial:number):MatchFlowVerdict=>error<=good?"TREFENO":error<=partial?"CASTECNE":"NETREFENO";
const expected=(shape:ExpectedMatchShape,side:"home"|"away",key:Exclude<MetricKey,"possession">):ExpectedMetric=>shape[side][key];

const DIAGNOSIS_COPY:Record<MatchFlowDiagnosisCode,{label:string;summary:string}>={
  FLOW_CONFIRMED:{label:"Průběh potvrzen",summary:"Zápas se vyvíjel v souladu s předzápasovým očekáváním."},
  CORRECT_FLOW_BAD_FINISHING:{label:"Průběh správně, rozhodlo zakončení",summary:"Tvorba hry odpovídala očekávání, ale góly neodpovídaly vytvořeným šancím."},
  WRONG_DOMINANCE:{label:"Obrácená dominance",summary:"Nebezpečnější byl jiný tým nebo byl poměr sil výrazně jiný, než model čekal."},
  WRONG_PACE:{label:"Chybně odhadnuté tempo",summary:"Objem tvorby šancí byl výrazně vyšší nebo nižší než předzápasové očekávání."},
  CHANCE_CREATION_MISS:{label:"Jiná tvorba šancí",summary:"Střely, xG nebo zakončení z vápna se významně odchýlily od očekávání."},
  WEAKER_SIDE_ABSENT:{label:"Slabší tým se nezapojil",summary:"Slabší strana vytvořila podstatně menší díl nebezpečí, než model očekával."},
  STRUCTURAL_CHANGE:{label:"Zápas změnila mimořádná událost",summary:"Červená karta nebo přerušení zásadně změnily podmínky pro původní predikci."},
  PARTIAL_MATCH:{label:"Průběh odpovídal jen částečně",summary:"Část očekávaného obrazu se potvrdila, jiné důležité složky nikoli."},
  INSUFFICIENT_DATA:{label:"Nedostatek dat",summary:"Pro spolehlivé posouzení očekávaného průběhu chybí dostatek živých nebo finálních statistik."},
};

export function diagnoseMatchFlow(input:{verdict:MatchFlowVerdict;structurallyChanged:boolean;components:MatchFlowComponent[]}):MatchFlowDiagnosis{
  const component=(key:MatchFlowComponent["key"])=>input.components.find((item)=>item.key===key);
  let code:MatchFlowDiagnosisCode;
  if(input.structurallyChanged)code="STRUCTURAL_CHANGE";
  else if(input.verdict==="NEDOSTATEK_DAT")code="INSUFFICIENT_DATA";
  else if(input.verdict!=="NETREFENO"&&component("FINISHING")?.verdict==="NETREFENO")code="CORRECT_FLOW_BAD_FINISHING";
  else if(component("DOMINANCE")?.verdict==="NETREFENO")code="WRONG_DOMINANCE";
  else if(component("PACE")?.verdict==="NETREFENO")code="WRONG_PACE";
  else if(component("WEAKER_SIDE")?.verdict==="NETREFENO"&&(component("WEAKER_SIDE")?.difference??0)<0)code="WEAKER_SIDE_ABSENT";
  else if(component("CHANCE_CREATION")?.verdict==="NETREFENO")code="CHANCE_CREATION_MISS";
  else if(input.verdict==="TREFENO")code="FLOW_CONFIRMED";
  else code="PARTIAL_MATCH";
  return{code,...DIAGNOSIS_COPY[code]};
}

export function evaluateMatchFlow(input:{pressure:PerformancePressureShadow;minute:number;status?:string;home:FlowStats;away:FlowStats;goals?:{home:number;away:number}|null;redCards?:number;interrupted?:boolean;final?:boolean}):MatchFlowEvaluation{
  const shape=input.pressure.expectedMatchShape,minute=Math.min(90,Math.max(0,input.minute)),final=input.final===true||["FT","AET","PEN"].includes(input.status??""),warnings:string[]=[],structurallyChanged=(input.redCards??0)>0||input.interrupted===true;
  if((input.redCards??0)>0)warnings.push("Průběh ovlivnila červená karta.");if(input.interrupted)warnings.push("Zápas byl přerušen nebo nestandardně prodloužen.");
  const components:MatchFlowComponent[]=[];
  const order:Array<[MetricKey,string]>=[["xg","xG"],["shotsOnTarget","střel na branku"],["shotsInsideBox","střel z vápna"],["shots","střel"],["corners","rohů"],["possession","držení"]];let dominance:{expected:number;actual:number;source:string}|null=null;
  for(const[key,source]of order){const actual=share(value(input.home,key),value(input.away,key)),exp=key==="possession"?shape.home.possessionShare.value:key==="xg"?shape.home.chanceShare.value:share(expected(shape,"home",key).value,expected(shape,"away",key).value);if(actual!=null&&exp!=null){dominance={actual,expected:exp,source};break}}
  if(dominance&&minute>=15){const error=Math.abs(dominance.actual-dominance.expected);components.push({key:"DOMINANCE",label:"Dominance",verdict:grade(error,.1,.2),detail:`Očekávaný podíl domácích ${Math.round(dominance.expected*100)} %, skutečnost ${Math.round(dominance.actual*100)} % podle ${dominance.source}.`,expected:round(dominance.expected),actual:round(dominance.actual),difference:round(dominance.actual-dominance.expected),source:dominance.source})}
  // Bez kalibrované minutové křivky nevydáváme lineární odhad za live realitu.
  // V3 hodnotí objem jen na pevných checkpointech: poločas (46 % finálního pásma) a konec.
  const checkpoint=final?1:(input.status==="HT"||(minute>=44&&minute<=50)?0.46:null);
  const paceOrder:Array<[Exclude<MetricKey,"possession">,string]>=[["shots","střel"],["shotsOnTarget","střel na branku"],["shotsInsideBox","střel z vápna"],["xg","xG"]];let pace:{expected:number;low:number;high:number;actual:number;source:string}|null=null;
  if(checkpoint!=null)for(const[key,source]of paceOrder){const hm=expected(shape,"home",key),am=expected(shape,"away",key),exp=total(hm.value,am.value),actual=total(value(input.home,key),value(input.away,key)),low=total(hm.interval?.low??hm.value,am.interval?.low??am.value),high=total(hm.interval?.high??hm.value,am.interval?.high??am.value);if(exp!=null&&exp>0&&actual!=null&&low!=null&&high!=null){pace={expected:exp*checkpoint,low:low*checkpoint,high:high*checkpoint,actual,source};break}}
  if(pace){const outside=pace.actual<pace.low?pace.low-pace.actual:pace.actual>pace.high?pace.actual-pace.high:0,span=Math.max(1,pace.high-pace.low),verdict:MatchFlowVerdict=outside===0?"TREFENO":outside<=span*.5?"CASTECNE":"NETREFENO";components.push({key:"PACE",label:"Tempo",verdict,detail:`${final?"Konec":"Poločas"}: ${pace.actual.toFixed(1)}; typické pásmo ${pace.low.toFixed(1)}–${pace.high.toFixed(1)} (${pace.source}).`,expected:round(pace.expected),actual:round(pace.actual),difference:round(outside),source:pace.source})}
  const chanceKeys:Array<Exclude<MetricKey,"possession">>=["xg","shotsOnTarget","shotsInsideBox"],errors=checkpoint==null?[]:chanceKeys.flatMap(key=>{const hm=expected(shape,"home",key),am=expected(shape,"away",key),actual=total(value(input.home,key),value(input.away,key)),low=total(hm.interval?.low??hm.value,am.interval?.low??am.value),high=total(hm.interval?.high??hm.value,am.interval?.high??am.value);if(actual==null||low==null||high==null)return[];const lo=low*checkpoint,hi=high*checkpoint;return actual<lo?[(lo-actual)/Math.max(1,hi-lo)]:actual>hi?[(actual-hi)/Math.max(1,hi-lo)]:[0]});
  if(errors.length){const error=errors.reduce((a,b)=>a+b,0)/errors.length;components.push({key:"CHANCE_CREATION",label:"Tvorba šancí",verdict:grade(error,0,.6),detail:`${errors.length} dostupné ukazatele; odchylka je hodnocena proti jejich 80% pásmům.`,expected:null,actual:null,difference:round(error),source:chanceKeys.filter(key=>value(input.home,key)!=null||value(input.away,key)!=null).join(", ")})}
  const weakActual=dominance?(shape.weakerSide==="HOME"?dominance.actual:1-dominance.actual):null;if(weakActual!=null&&minute>=15){const error=Math.abs(weakActual-shape.weakerChanceShare);components.push({key:"WEAKER_SIDE",label:"Příspěvek slabší strany",verdict:grade(error,.1,.2),detail:`Očekávání ${Math.round(shape.weakerChanceShare*100)} %, skutečnost ${Math.round(weakActual*100)} %.`,expected:round(shape.weakerChanceShare),actual:round(weakActual),difference:round(weakActual-shape.weakerChanceShare),source:dominance?.source??null})}
  const actualXg=total(value(input.home,"xg"),value(input.away,"xg")),goals=input.goals?input.goals.home+input.goals.away:null;if(goals!=null&&actualXg!=null&&(final||minute>=70)){const error=Math.abs(goals-actualXg);components.push({key:"FINISHING",label:"Zakončení",verdict:grade(error,.75,1.5),detail:`${goals} gólů z ${actualXg.toFixed(2)} xG; zakončení je oddělené od průběhu.`,expected:round(actualXg),actual:goals,difference:round(goals-actualXg),source:"góly proti xG"})}
  const evaluable=components.filter(c=>c.key!=="FINISHING");let verdict:MatchFlowVerdict="NEDOSTATEK_DAT";if(minute>=15&&evaluable.length>=2){const avg=evaluable.reduce((sum,c)=>sum+(c.verdict==="TREFENO"?0:c.verdict==="CASTECNE"?1:2),0)/evaluable.length;verdict=avg<=.5?"TREFENO":avg<=1.25?"CASTECNE":"NETREFENO"}
  const rank=(v:MatchFlowVerdict)=>({TREFENO:0,CASTECNE:1,NETREFENO:2,NEDOSTATEK_DAT:3}[v]),sorted=[...evaluable].sort((a,b)=>rank(a.verdict)-rank(b.verdict)),headlines={TREFENO:"Předpokládaný průběh se potvrzuje.",CASTECNE:"Průběh odpovídá očekávání jen částečně.",NETREFENO:"Skutečný obraz zápasu je výrazně jiný než očekávání.",NEDOSTATEK_DAT:"Na spolehlivé porovnání zatím není dost dat."};
  const diagnosis=diagnoseMatchFlow({verdict,structurallyChanged,components});
  return{version:3,pressureVersion:input.pressure.version,minute,final,verdict,headline:headlines[verdict],diagnosis,strongestMatch:sorted.find(c=>c.verdict==="TREFENO")?.label??null,largestMiss:[...evaluable].reverse().find(c=>c.verdict==="NETREFENO")?.label??null,coverage:round(evaluable.length/4),structurallyChanged,warnings,components};
}
