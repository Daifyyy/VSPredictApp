import type { ExpectedMatchShape, PerformancePressureShadow } from "./performancePressureShadow";
import type { MatchFlowDiagnosis, MatchFlowEvaluation, MatchFlowVerdict } from "./matchFlowEvaluation";

export const MATCH_INSIGHT_VERSION = 1;
export type MatchInsightPhase = "PREMATCH" | "LIVE" | "FINAL";
export type MatchInsightDetail = "PUBLIC" | "PRO";

export interface MatchInsight {
  version: 1;
  phase: MatchInsightPhase;
  pressureVersion: number;
  capturedAt: string;
  minute: number | null;
  final: boolean;
  publicSummary: {
    title: string;
    text: string;
    verdict: MatchFlowVerdict | null;
    diagnosis: MatchFlowDiagnosis | null;
    strongestMatch: string | null;
    largestMiss: string | null;
    structurallyChanged: boolean;
  };
  expectation: ExpectedMatchShape | null;
  technical: {
    homePressure: number | null;
    awayPressure: number | null;
    openness: number | null;
    dependencyRisk: PerformancePressureShadow["dependencyRisk"];
  } | null;
  evaluation: MatchFlowEvaluation | null;
  coverage: number | null;
  confidence: number | null;
  shadow: true;
}

function prematchCopy(pressure: PerformancePressureShadow) {
  const share = pressure.expectedMatchShape.home.chanceShare.value;
  const dominance = share == null ? "Poměr tvorby šancí zatím nelze spolehlivě určit." : share >= .6 ? "Domácí by měli vytvářet většinu nebezpečí." : share <= .4 ? "Hosté by měli vytvářet většinu nebezpečí." : "Tvorba šancí by měla být poměrně vyrovnaná.";
  const openness = pressure.opennessScore == null ? "" : pressure.opennessScore >= 70 ? " Čeká se otevřenější zápas." : pressure.opennessScore <= 45 ? " Čeká se spíše sevřený zápas." : " Čeká se střední tempo.";
  const dependency = pressure.dependencyRisk.level === "HIGH" ? " Výsledek gólového trhu je výrazně závislý na zapojení slabšího týmu." : "";
  return `${dominance}${openness}${dependency}`;
}

export function buildMatchInsight(input:{pressure:PerformancePressureShadow;evaluation?:MatchFlowEvaluation|null;phase?:MatchInsightPhase;capturedAt?:string}):MatchInsight{
  const evaluation=input.evaluation??null;
  const phase=input.phase??(evaluation?.final?"FINAL":evaluation?"LIVE":"PREMATCH");
  const confidenceValues=[input.pressure.expectedMatchShape.home.xg.confidence,input.pressure.expectedMatchShape.away.xg.confidence,input.pressure.expectedMatchShape.home.shots.confidence,input.pressure.expectedMatchShape.away.shots.confidence];
  const confidence=confidenceValues.reduce((sum,value)=>sum+value,0)/confidenceValues.length;
  return{
    version:MATCH_INSIGHT_VERSION,
    phase,
    pressureVersion:input.pressure.version,
    capturedAt:input.capturedAt??input.pressure.capturedAt,
    minute:evaluation?.minute??null,
    final:evaluation?.final??false,
    publicSummary:{
      title:evaluation?.diagnosis.label??"Očekávaný obraz zápasu",
      text:evaluation?.diagnosis.summary??prematchCopy(input.pressure),
      verdict:evaluation?.verdict??null,
      diagnosis:evaluation?.diagnosis??null,
      strongestMatch:evaluation?.strongestMatch??null,
      largestMiss:evaluation?.largestMiss??null,
      structurallyChanged:evaluation?.structurallyChanged??false,
    },
    expectation:input.pressure.expectedMatchShape,
    technical:{homePressure:input.pressure.home.expectedPressure,awayPressure:input.pressure.away.expectedPressure,openness:input.pressure.opennessScore,dependencyRisk:input.pressure.dependencyRisk},
    evaluation,
    coverage:evaluation?.coverage??input.pressure.expectedMatchShape.coverage,
    confidence:Number(confidence.toFixed(3)),
    shadow:true,
  };
}

export function publicMatchInsight(insight:MatchInsight):MatchInsight{
  return{...insight,publicSummary:{...insight.publicSummary,diagnosis:null},expectation:null,technical:null,evaluation:null,coverage:null,confidence:null};
}
