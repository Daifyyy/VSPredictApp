import { prisma } from "@/lib/db";
import { calibrateOutcome } from "@/lib/stats/predict";
import { applyLogistic } from "@/lib/picks/temporalCalibration";
import { goalDistributionProbabilities, type GoalDistributionParameters } from "@/lib/picks/goalDistributionCalibration";

interface ForecastForShadow {
  fixtureId: number;
  modelContext: string;
  modelVersion: number;
  predictedAt: Date;
  lambdaHome: number;
  lambdaAway: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  over25: number;
  bttsYes: number;
}

type Parameters = { a?: unknown; b?: unknown };
type ShadowDefinition = Awaited<ReturnType<typeof prisma.calibrationDefinition.findMany>>[number];
const definitionCache = new Map<string, { expiresAt: number; rows: ShadowDefinition[] }>();

function pair(value: unknown): { a: number; b: number } | null {
  if (!value || typeof value !== "object") return null;
  const parameters = value as Parameters;
  return typeof parameters.a === "number" && typeof parameters.b === "number" ? { a: parameters.a, b: parameters.b } : null;
}

function goalParameters(value: unknown): GoalDistributionParameters | null {
  if (!value || typeof value !== "object") return null;
  const parameters = value as Partial<GoalDistributionParameters>;
  return typeof parameters.totalScale === "number" && typeof parameters.homeShareShift === "number" && typeof parameters.rho === "number"
    ? { totalScale: parameters.totalScale, homeShareShift: parameters.homeShareShift, rho: parameters.rho }
    : null;
}

/** Captures accepted shadow candidates beside the source forecast; never mutates it. */
export async function captureCalibrationShadows(forecast: ForecastForShadow) {
  const cacheKey = `${forecast.modelContext}:${forecast.modelVersion}`;
  const cached = definitionCache.get(cacheKey);
  const definitions = cached && cached.expiresAt > Date.now() ? cached.rows : await prisma.calibrationDefinition.findMany({
    where: { status: "SHADOW", modelContext: forecast.modelContext, sourceModelVersion: forecast.modelVersion },
  });
  if (!cached || cached.expiresAt <= Date.now()) definitionCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, rows: definitions });
  for (const definition of definitions) {
    let probabilities: Record<string, number> | null = null;
    const parameters = pair(definition.parameters);
    if (definition.market === "1X2" && definition.method === "OUTCOME_PLATT") {
      if (!parameters) continue;
      const [home, draw, away] = calibrateOutcome(forecast.homeWin, forecast.draw, forecast.awayWin, parameters.a, parameters.b);
      probabilities = { home, draw, away };
    } else if (definition.method === "BINARY_LOGISTIC" && definition.market === "OVER_25") {
      if (!parameters) continue;
      probabilities = { over: applyLogistic(forecast.over25, parameters), under: 1 - applyLogistic(forecast.over25, parameters) };
    } else if (definition.method === "BINARY_LOGISTIC" && definition.market === "BTTS") {
      if (!parameters) continue;
      probabilities = { yes: applyLogistic(forecast.bttsYes, parameters), no: 1 - applyLogistic(forecast.bttsYes, parameters) };
    } else if (definition.method === "GOAL_DISTRIBUTION") {
      const goal = goalParameters(definition.parameters);
      if (!goal) continue;
      const result = goalDistributionProbabilities(forecast.lambdaHome, forecast.lambdaAway, goal);
      probabilities = { home: result.home, draw: result.draw, away: result.away, over25: result.over25, btts: result.btts, lambdaHome: result.homeLambda, lambdaAway: result.awayLambda };
    }
    if (!probabilities) continue;
    await prisma.calibrationShadowPrediction.upsert({
      where: { definitionId_fixtureId: { definitionId: definition.id, fixtureId: forecast.fixtureId } },
      create: { definitionId: definition.id, fixtureId: forecast.fixtureId, sourcePredictedAt: forecast.predictedAt, probabilities },
      update: {},
    });
  }
}
