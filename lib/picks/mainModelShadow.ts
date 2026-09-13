export const MAIN_MODEL_SHADOW_VERSION = 8;
export const MAIN_MODEL_SHADOW_METHOD = "MARKET_RESIDUAL_BASELINE_V1";

export type OutcomeProbabilities = { home: number; draw: number; away: number };

function normalized(values: OutcomeProbabilities) {
  const sum = values.home + values.draw + values.away;
  if (!Number.isFinite(sum) || sum <= 0) return null;
  const result = { home: values.home / sum, draw: values.draw / sum, away: values.away / sum };
  return Object.values(result).every((value) => Number.isFinite(value) && value > 0 && value < 1) ? result : null;
}

/** Geometrický pool pracuje v log-probability prostoru: trh je baseline a naše
 * modely dodávají pouze omezenou korekci. Bez připraveného Elo se jeho váha
 * deterministicky přesune do zdrojového modelu. */
export function marketResidualBaseline(input: { market: OutcomeProbabilities; source: OutcomeProbabilities; elo?: OutcomeProbabilities | null }) {
  const market = normalized(input.market), source = normalized(input.source), elo = input.elo ? normalized(input.elo) : null;
  if (!market || !source) return null;
  const weights = elo ? { market: .7, source: .2, elo: .1 } : { market: .7, source: .3, elo: 0 };
  const pooled = (side: keyof OutcomeProbabilities) => Math.exp(weights.market * Math.log(market[side]) + weights.source * Math.log(source[side]) + (elo ? weights.elo * Math.log(elo[side]) : 0));
  const probabilities = normalized({ home: pooled("home"), draw: pooled("draw"), away: pooled("away") });
  return probabilities ? { probabilities, weights } : null;
}
