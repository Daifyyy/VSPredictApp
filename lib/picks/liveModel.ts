import type { Metric } from "@/lib/types";

export const LIVE_MODEL_VERSION = 1;
export const LIVE_POLICY_VERSION = 1;

export interface LiveModelInput {
  minute: number;
  scoreHome: number;
  scoreAway: number;
  preMatchLambdaHome: number;
  preMatchLambdaAway: number;
  readinessSample: number;
  lowConfidence: boolean;
  home: Partial<Record<Metric, number>>;
  away: Partial<Record<Metric, number>>;
}

export interface LiveProbabilities {
  home: number;
  draw: number;
  away: number;
  bttsYes: number;
  homeOver05: number;
  homeOver15: number;
  awayOver05: number;
  awayOver15: number;
  totalOver: Record<string, number>;
}

export interface LiveModelResult {
  probabilities: LiveProbabilities;
  remainingLambdaHome: number;
  remainingLambdaAway: number;
  lowConfidence: boolean;
  inputs: Record<string, number | boolean | null>;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const metric = (side: Partial<Record<Metric, number>>, key: Metric) => side[key] ?? null;

function poisson(lambda: number, k: number): number {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
}

/**
 * Verze v1 je auditovatelný prior + omezená live aktualizace, nikoli samoučící se černá
 * skříňka. Live data mohou zbývající intenzitu změnit nejvýše o 25 %.
 */
export function calculateLiveModel(input: LiveModelInput): LiveModelResult {
  const minute = clamp(input.minute, 1, 90);
  const remainingShare = clamp((94 - minute) / 94, .03, 1);
  const hxg = metric(input.home, "XG");
  const axg = metric(input.away, "XG");
  const hsot = metric(input.home, "SHOTS_ON_TARGET");
  const asot = metric(input.away, "SHOTS_ON_TARGET");
  const hr = metric(input.home, "RED_CARDS") ?? 0;
  const ar = metric(input.away, "RED_CARDS") ?? 0;
  const expectedSoFarHome = input.preMatchLambdaHome * (minute / 94);
  const expectedSoFarAway = input.preMatchLambdaAway * (minute / 94);
  const evidenceWeight = clamp((minute - 10) / 65, 0, .62);
  const rateHome = hxg != null ? hxg / Math.max(.12, expectedSoFarHome) : hsot != null ? (hsot + 1) / (expectedSoFarHome * 2.8 + 1) : 1;
  const rateAway = axg != null ? axg / Math.max(.12, expectedSoFarAway) : asot != null ? (asot + 1) / (expectedSoFarAway * 2.8 + 1) : 1;
  const liveHome = clamp(1 + (rateHome - 1) * evidenceWeight, .75, 1.25);
  const liveAway = clamp(1 + (rateAway - 1) * evidenceWeight, .75, 1.25);
  const redHome = clamp(1 - hr * .22 + ar * .13, .6, 1.35);
  const redAway = clamp(1 - ar * .22 + hr * .13, .6, 1.35);
  const lh = clamp(input.preMatchLambdaHome * remainingShare * liveHome * redHome, .02, 3.5);
  const la = clamp(input.preMatchLambdaAway * remainingShare * liveAway * redAway, .02, 3.5);
  let home = 0, draw = 0, away = 0, btts = 0, home05 = 0, home15 = 0, away05 = 0, away15 = 0;
  const totals = [1.5, 2.5, 3.5, 4.5, 5.5];
  const totalOver = Object.fromEntries(totals.map((line) => [line.toFixed(1), 0]));
  for (let h = 0; h <= 10; h++) for (let a = 0; a <= 10; a++) {
    const p = poisson(lh, h) * poisson(la, a);
    const fh = input.scoreHome + h, fa = input.scoreAway + a;
    if (fh > fa) home += p; else if (fh === fa) draw += p; else away += p;
    if (fh > 0 && fa > 0) btts += p;
    if (fh > .5) home05 += p;
    if (fh > 1.5) home15 += p;
    if (fa > .5) away05 += p;
    if (fa > 1.5) away15 += p;
    for (const line of totals) if (fh + fa > line) totalOver[line.toFixed(1)] += p;
  }
  const sum = home + draw + away;
  return {
    probabilities: { home: home / sum, draw: draw / sum, away: away / sum, bttsYes: btts / sum, homeOver05: home05 / sum, homeOver15: home15 / sum, awayOver05: away05 / sum, awayOver15: away15 / sum, totalOver },
    remainingLambdaHome: lh,
    remainingLambdaAway: la,
    lowConfidence: input.lowConfidence || input.readinessSample < 6 || (hxg == null && hsot == null) || (axg == null && asot == null),
    inputs: { minute, hxg, axg, hsot, asot, redHome: hr, redAway: ar, evidenceWeight, liveHome, liveAway },
  };
}

export interface LiveGateInput {
  minute: number;
  lowConfidence: boolean;
  blocked: boolean;
  stopped: boolean;
  modelProbability: number;
  marketProbability: number;
  decimalOdds: number;
  confirmed: boolean;
  synchronized: boolean;
}

export function evaluateLiveCandidate(input: LiveGateInput): { status: "candidate" | "watch" | "reject"; reason: string; edge: number; ev: number } {
  const edge = input.modelProbability - input.marketProbability;
  const ev = input.modelProbability * input.decimalOdds - 1;
  if (input.minute < 15 || input.minute > 80) return { status: "reject", reason: "Výběry jsou povolené pouze mezi 15. a 80. minutou.", edge, ev };
  if (input.blocked || input.stopped) return { status: "reject", reason: "Bookmaker nyní trh nenabízí.", edge, ev };
  if (!input.synchronized) return { status: "watch", reason: "Skóre, statistiky a cena nejsou časově sladěné.", edge, ev };
  if (input.lowConfidence) return { status: "watch", reason: "Pro rozhodnutí zatím není dost spolehlivých dat.", edge, ev };
  if (edge < .05) return { status: "watch", reason: `Chybí ${((.05 - edge) * 100).toFixed(1)} p. b. proti trhu.`, edge, ev };
  if (ev < .04) return { status: "watch", reason: `Očekávaná hodnota je jen ${(ev * 100).toFixed(1)} %.`, edge, ev };
  if (!input.confirmed) return { status: "watch", reason: "Čeká se na potvrzení v dalším live snímku.", edge, ev };
  return { status: "candidate", reason: "Edge alespoň 5 p. b. a EV alespoň 4 % potvrzené ve dvou snímcích.", edge, ev };
}
