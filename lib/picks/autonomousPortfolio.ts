export type AutonomousStrategy = "ONE_X_TWO" | "OVER_25" | "BTTS_YES";
export type AutonomousStatus = "candidate" | "watch" | "unavailable";

export const AUTONOMOUS_POLICY_VERSION: Record<AutonomousStrategy, number> = {
  ONE_X_TWO: 2,
  OVER_25: 1,
  BTTS_YES: 1,
};

export interface AutonomousInput {
  strategy: AutonomousStrategy;
  modelProbability: number;
  marketProbability: number | null;
  decimalOdds: number | null;
  secondProbability?: number;
  readinessSample: number;
  lowConfidence: boolean;
  sampleCount: number;
  minutesToKickoff: number;
}

export interface AutonomousDecision {
  status: AutonomousStatus;
  reason: string;
  edge: number | null;
  expectedValue: number | null;
}

const CONFIG = {
  ONE_X_TWO: { probability: 0.58, edge: 0.04 },
  OVER_25: { probability: 0.6, edge: 0.04 },
  BTTS_YES: { probability: 0.6, edge: 0.02 },
} as const;

/** Cista, verzovana publikacni brana. Poradi kontrol zaroven urcuje jednu vetu v UI. */
export function evaluateAutonomousTip(input: AutonomousInput): AutonomousDecision {
  const cfg = CONFIG[input.strategy];
  const edge = input.marketProbability == null ? null : input.modelProbability - input.marketProbability;
  const expectedValue = input.decimalOdds == null ? null : input.modelProbability * input.decimalOdds - 1;
  const watch = (reason: string): AutonomousDecision => ({ status: "watch", reason, edge, expectedValue });
  if (input.lowConfidence || input.readinessSample < 6)
    return watch(`Efektivni vzorek ${input.readinessSample.toFixed(1)}; potreba je alespon 6 zapasu.`);
  if (input.modelProbability + Number.EPSILON < cfg.probability)
    return watch(`Modelu chybi ${((cfg.probability - input.modelProbability) * 100).toFixed(1)} p. b. k hranici ${Math.round(cfg.probability * 100)} %.`);
  if (input.strategy === "ONE_X_TWO" && input.secondProbability != null && input.modelProbability - input.secondProbability + Number.EPSILON < 0.1)
    return watch("Naskok pred druhou moznosti je mensi nez 10 p. b.");
  if (input.marketProbability == null || input.decimalOdds == null)
    return { status: "unavailable", reason: "Chybi srovnatelny trh nebo referencni kurz.", edge, expectedValue };
  if (input.sampleCount < 3)
    return watch(`Zatim jen ${input.sampleCount} kurzove vzorky; potreba jsou alespon 3.`);
  if (input.minutesToKickoff < 15)
    return watch("Do vykopu zbyva mene nez 15 minut; novy vyber uz nelze publikovat.");
  if (edge! + Number.EPSILON < cfg.edge)
    return watch(`Proti trhu chybi ${((cfg.edge - edge!) * 100).toFixed(1)} p. b. k pozadovane hrane.`);
  if (expectedValue! + Number.EPSILON < 0.02)
    return watch(`Ocekavana hodnota je ${(expectedValue! * 100).toFixed(1)} %; potreba jsou alespon 2 %.`);
  return {
    status: "candidate",
    reason: `Splneno: model ${Math.round(input.modelProbability * 100)} %, rozdil +${(edge! * 100).toFixed(1)} p. b., EV +${(expectedValue! * 100).toFixed(1)} %.`,
    edge,
    expectedValue,
  };
}
