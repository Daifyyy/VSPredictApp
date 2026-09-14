import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MODEL_VERSION } from "./modelVersion";
import { PUBLIC_CLUB_LEAGUES } from "./catalog";
import { STRATEGY_CATALOG } from "@/lib/picks/modelLab";
import { GUARDED_ONE_X_TWO_POLICY_VERSION } from "@/lib/picks/autonomousPortfolio";
import { personnelShadowDashboard } from "./personnelShadow";
import { quickOverviewCaptureAudit } from "./quickOverviewAudit";
import { MAIN_MODEL_SHADOW_METHOD, MAIN_MODEL_SHADOW_VERSION } from "@/lib/picks/mainModelShadow";
import { evaluateModelRows, type ModelEvaluationRow } from "@/lib/picks/modelEvaluation";
import type { PerformancePressureShadow } from "@/lib/picks/performancePressureShadow";

const FINISHED = ["FT", "AET", "PEN"];
const EPS = 1e-9;

function marketProbabilities(row: { oddsHome: number | null; oddsDraw: number | null; oddsAway: number | null }) {
  if (!row.oddsHome || !row.oddsDraw || !row.oddsAway) return null;
  const raw = [1 / row.oddsHome, 1 / row.oddsDraw, 1 / row.oddsAway];
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((value) => value / sum);
}

function scores(rows: Array<{ homeWin: number; draw: number; awayWin: number; homeGoals: number | null; awayGoals: number | null; oddsHome: number | null; oddsDraw: number | null; oddsAway: number | null }>) {
  let modelLoss = 0, marketLoss = 0, n = 0;
  for (const row of rows) {
    if (row.homeGoals == null || row.awayGoals == null) continue;
    const market = marketProbabilities(row);
    if (!market) continue;
    const model = [row.homeWin, row.draw, row.awayWin];
    const outcome = row.homeGoals > row.awayGoals ? 0 : row.homeGoals === row.awayGoals ? 1 : 2;
    modelLoss += -Math.log(Math.max(EPS, model[outcome]));
    marketLoss += -Math.log(Math.max(EPS, market[outcome]));
    n++;
  }
  return { n, modelLogLoss: n ? modelLoss / n : null, marketLogLoss: n ? marketLoss / n : null };
}

export async function getModelGovernanceDashboard(now = new Date()) {
  const [predictions, definitions, checkpoints, incidents, shadowCounts, strategyTips, personnel, quickOverview] = await Promise.all([
    prisma.fixturePrediction.findMany({
      where: { modelVersion: MODEL_VERSION, modelContext: "LEAGUE", status: { in: FINISHED }, homeGoals: { not: null }, awayGoals: { not: null } },
      select: { fixtureId: true, leagueId: true, homeWin: true, draw: true, awayWin: true, homeGoals: true, awayGoals: true, oddsHome: true, oddsDraw: true, oddsAway: true, readinessSample: true, lowConfidence: true },
    }),
    prisma.modelStrategyDefinition.findMany({ where: { modelVersion: MODEL_VERSION }, include: { reports: { orderBy: { milestone: "desc" }, take: 1 } } }),
    prisma.calibrationCheckpoint.findMany({ where: { sourceModelVersion: MODEL_VERSION }, orderBy: { modelContext: "asc" } }),
    prisma.dataIncident.findMany({ where: { status: "OPEN", OR: [{ kind: "MODEL_DEGRADATION" }, { kind: "PORTFOLIO_CAPTURE_GAP" }, { kind: "COVERAGE" }] }, orderBy: { lastSeenAt: "desc" }, take: 20 }),
    prisma.autonomousTipSnapshot.groupBy({ by: ["status"], where: { strategy: "ONE_X_TWO_GUARDED", policyVersion: GUARDED_ONE_X_TWO_POLICY_VERSION, modelContext: "LEAGUE" }, _count: true }),
    prisma.autonomousTipSnapshot.findMany({ where: { modelContext: "LEAGUE", status: "candidate" }, select: { strategy: true, policyVersion: true, fixtureId: true } }),
    personnelShadowDashboard(now),
    quickOverviewCaptureAudit(now),
  ]);
  const mainModelShadows = await prisma.mainModelShadowPrediction.findMany({
    where: { shadowVersion: MAIN_MODEL_SHADOW_VERSION, method: MAIN_MODEL_SHADOW_METHOD, modelContext: "LEAGUE" },
    orderBy: { kickoff: "asc" },
  });
  const pressureRows = await prisma.fixturePrediction.findMany({
    where: { modelVersion: MODEL_VERSION, modelContext: "LEAGUE", inputSnapshot: { not: Prisma.DbNull } },
    orderBy: { kickoff: "desc" },
    take: 500,
    select: { fixtureId: true, kickoff: true, homeName: true, awayName: true, homeGoals: true, awayGoals: true, inputSnapshot: true },
  });
  const shadowFixtures = mainModelShadows.length ? await prisma.fixturePrediction.findMany({
    where: { fixtureId: { in: mainModelShadows.map((row) => row.fixtureId) }, homeGoals: { not: null }, awayGoals: { not: null } },
    select: { fixtureId: true, leagueId: true, homeGoals: true, awayGoals: true, oddsCloseHome: true, oddsCloseDraw: true, oddsCloseAway: true },
  }) : [];
  const shadowFixtureById = new Map(shadowFixtures.map((row) => [row.fixtureId, row]));
  const shadowCohort = mainModelShadows.flatMap((row) => {
    const fixture = shadowFixtureById.get(row.fixtureId);
    if (!fixture) return [];
    const common = {
      fixtureId: row.fixtureId, leagueId: fixture.leagueId, kickoff: row.kickoff,
      homeGoals: fixture.homeGoals, awayGoals: fixture.awayGoals,
      oddsHome: 1 / row.marketHome, oddsDraw: 1 / row.marketDraw, oddsAway: 1 / row.marketAway,
      oddsCloseHome: fixture.oddsCloseHome, oddsCloseDraw: fixture.oddsCloseDraw, oddsCloseAway: fixture.oddsCloseAway,
    };
    return [{
      source: { ...common, homeWin: row.sourceHome, draw: row.sourceDraw, awayWin: row.sourceAway } satisfies ModelEvaluationRow,
      candidate: { ...common, homeWin: row.homeProbability, draw: row.drawProbability, awayWin: row.awayProbability } satisfies ModelEvaluationRow,
    }];
  });
  const sourceEvaluation = evaluateModelRows(shadowCohort.map((row) => row.source));
  const candidateEvaluation = evaluateModelRows(shadowCohort.map((row) => row.candidate));
  const checkpointSizes = Array.from(new Set([
    ...Array.from({ length: Math.floor(shadowCohort.length / 10) }, (_, index) => (index + 1) * 10),
    shadowCohort.length,
  ])).filter((size) => size > 0).slice(-12);
  const development = checkpointSizes.map((size) => {
    const cohort = shadowCohort.slice(0, size);
    const source = evaluateModelRows(cohort.map((row) => row.source));
    const candidate = evaluateModelRows(cohort.map((row) => row.candidate));
    return {
      sampleSize: size,
      through: cohort.at(-1)?.candidate.kickoff ?? null,
      sourceLogLoss: source.model.logLoss,
      candidateLogLoss: candidate.model.logLoss,
      openingLogLoss: candidate.opening.logLoss,
      closingLogLoss: candidate.closing.logLoss,
      deltaToSource: candidate.model.logLoss != null && source.model.logLoss != null ? candidate.model.logLoss - source.model.logLoss : null,
      deltaToOpening: candidate.model.logLoss != null && candidate.opening.logLoss != null ? candidate.model.logLoss - candidate.opening.logLoss : null,
    };
  });
  const mainModelShadow = {
    version: MAIN_MODEL_SHADOW_VERSION,
    method: MAIN_MODEL_SHADOW_METHOD,
    captured: mainModelShadows.length,
    settled: shadowCohort.length,
    minimumDecisionSample: 100,
    source: sourceEvaluation.model,
    candidate: candidateEvaluation.model,
    opening: candidateEvaluation.opening,
    closing: candidateEvaluation.closing,
    closingCoverage: candidateEvaluation.dataQuality.closingCoverage,
    development,
    verdict: shadowCohort.length < 100 ? "COLLECT" : candidateEvaluation.model.logLoss != null && sourceEvaluation.model.logLoss != null && candidateEvaluation.model.logLoss < sourceEvaluation.model.logLoss ? "V8_BEATS_V7" : "KEEP_V7",
  };
  const pressureCohort = pressureRows.flatMap((row) => {
    const snapshot = row.inputSnapshot as { performancePressure?: PerformancePressureShadow } | null;
    const pressure = snapshot?.performancePressure;
    return pressure ? [{ ...row, pressure }] : [];
  }).reverse();
  const settledPressure = pressureCohort.filter((row) => row.homeGoals != null && row.awayGoals != null && row.pressure.shadowOver25 != null);
  const binaryMetrics = (rows: typeof settledPressure, candidate: "current" | "shadow") => {
    if (!rows.length) return { n: 0, brier: null as number | null, logLoss: null as number | null };
    let brier = 0, logLoss = 0;
    for (const row of rows) {
      const hit = row.homeGoals! + row.awayGoals! > 2 ? 1 : 0;
      const raw = candidate === "current" ? row.pressure.currentOver25 : row.pressure.shadowOver25!;
      const probability = Math.min(1 - EPS, Math.max(EPS, raw));
      brier += (probability - hit) ** 2;
      logLoss += -(hit * Math.log(probability) + (1 - hit) * Math.log(1 - probability));
    }
    return { n: rows.length, brier: brier / rows.length, logLoss: logLoss / rows.length };
  };
  const pressureCheckpoints = Array.from(new Set([...Array.from({ length: Math.floor(settledPressure.length / 10) }, (_, index) => (index + 1) * 10), settledPressure.length])).filter(Boolean).slice(-12).map((size) => {
    const cohort = settledPressure.slice(0, size);
    const current = binaryMetrics(cohort, "current"), candidate = binaryMetrics(cohort, "shadow");
    return { sampleSize: size, through: cohort.at(-1)?.kickoff ?? null, currentLogLoss: current.logLoss, shadowLogLoss: candidate.logLoss, delta: current.logLoss != null && candidate.logLoss != null ? candidate.logLoss - current.logLoss : null };
  });
  const pressureDeltaRows = pressureCohort.filter((row) => row.pressure.over25Delta != null);
  const performancePressure = {
    version: 1,
    captured: pressureCohort.length,
    settled: settledPressure.length,
    minimumDecisionSample: 200,
    averageCoverage: pressureCohort.length ? pressureCohort.reduce((sum, row) => sum + row.pressure.coverage.ratio, 0) / pressureCohort.length : 0,
    averageOverDelta: pressureDeltaRows.length ? pressureDeltaRows.reduce((sum, row) => sum + row.pressure.over25Delta!, 0) / pressureDeltaRows.length : null,
    highDependency: pressureCohort.filter((row) => row.pressure.dependencyRisk.level === "HIGH").length,
    current: binaryMetrics(settledPressure, "current"),
    shadow: binaryMetrics(settledPressure, "shadow"),
    development: pressureCheckpoints,
    recent: pressureCohort.slice(-12).reverse().map((row) => ({ fixtureId: row.fixtureId, kickoff: row.kickoff, homeName: row.homeName, awayName: row.awayName, opennessScore: row.pressure.opennessScore, currentOver25: row.pressure.currentOver25, shadowOver25: row.pressure.shadowOver25, over25Delta: row.pressure.over25Delta, coverage: row.pressure.coverage.ratio, dependencyRisk: row.pressure.dependencyRisk.level, homePressure: row.pressure.home.expectedPressure, awayPressure: row.pressure.away.expectedPressure })),
  };
  const definitionsByKey = new Map(definitions.map((row) => [`${row.strategy}:${row.policyVersion}:${row.modelContext}`, row]));
  const finishedFixtures = new Set(predictions.map((row) => row.fixtureId));
  const samplesByKey = new Map<string, number>();
  for (const row of strategyTips) {
    if (!finishedFixtures.has(row.fixtureId)) continue;
    const key = `${row.strategy}:${row.policyVersion}`;
    samplesByKey.set(key, (samplesByKey.get(key) ?? 0) + 1);
  }
  const strategies = STRATEGY_CATALOG.filter((item) => !["RETIRED", "REJECTED"].includes(item.status)).map((item) => {
    const definition = definitionsByKey.get(`${item.strategy}:${item.policyVersion}:LEAGUE`);
    const sample = samplesByKey.get(`${item.strategy}:${item.policyVersion}`) ?? definition?.reports[0]?.sampleSize ?? 0;
    const nextMilestone = [50, 100, 200].find((value) => value > sample) ?? null;
    return { ...item, status: definition?.status ?? item.status, sample, nextMilestone, remaining: nextMilestone == null ? 0 : Math.max(0, nextMilestone - sample) };
  });
  const leagues = PUBLIC_CLUB_LEAGUES.map((league) => {
    const rows = predictions.filter((row) => row.leagueId === league.id);
    const metric = scores(rows);
    const delta = metric.modelLogLoss != null && metric.marketLogLoss != null ? metric.modelLogLoss - metric.marketLogLoss : null;
    const status = metric.n < 20 ? "LOW_SAMPLE" : delta != null && delta > .05 ? "REVIEW" : delta != null && delta <= 0 ? "PROMISING" : "WATCH";
    return { leagueId: league.id, name: league.name, ...metric, status, lowReadiness: rows.filter((row) => row.readinessSample < 7 || row.lowConfidence).length };
  }).sort((a, b) => ((b.modelLogLoss ?? 0) - (b.marketLogLoss ?? 0)) - ((a.modelLogLoss ?? 0) - (a.marketLogLoss ?? 0)));
  const tasks = [
    ...incidents.map((item) => ({ priority: item.severity === "CRITICAL" ? "NOW" : "WATCH", title: item.message, reason: "Otevřený provozní nebo modelový incident", due: "nyní" })),
    ...checkpoints.filter((item) => item.pendingCount >= 5).map((item) => ({ priority: "NOW", title: `Zkontrolovat nový kalibrační report ${item.modelContext}`, reason: `${item.pendingCount} nových výsledků naplnilo bezpečný přepočet`, due: "po nejbližším běhu cronu" })),
    ...strategies.filter((item) => item.nextMilestone != null && item.remaining <= 10).map((item) => ({ priority: "SOON", title: `Vyhodnotit ${item.title} při ${item.nextMilestone} výsledcích`, reason: `Do milníku zbývá ${item.remaining}`, due: `při n=${item.nextMilestone}` })),
    ...leagues.filter((item) => item.status === "REVIEW").map((item) => ({ priority: "WATCH", title: `Prověřit kohortu ${item.name}`, reason: `Modelový log-loss je o ${((item.modelLogLoss! - item.marketLogLoss!) * 100).toFixed(1)} bodu horší než trh (n=${item.n})`, due: "před změnou modelu" })),
  ];
  const shadow = Object.fromEntries(shadowCounts.map((row) => [row.status, row._count]));
  return { asOf: now, modelVersion: MODEL_VERSION, tasks, strategies, leagues, checkpoints, personnel, quickOverview, mainModelShadow, performancePressure, shadow: { total: Object.values(shadow).reduce((sum, value) => sum + value, 0), candidates: shadow.candidate ?? 0, watch: shadow.watch ?? 0 } };
}
