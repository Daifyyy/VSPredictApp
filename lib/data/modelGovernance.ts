import "server-only";
import { prisma } from "@/lib/db";
import { MODEL_VERSION } from "./modelVersion";
import { PUBLIC_CLUB_LEAGUES } from "./catalog";
import { STRATEGY_CATALOG } from "@/lib/picks/modelLab";
import { GUARDED_ONE_X_TWO_POLICY_VERSION } from "@/lib/picks/autonomousPortfolio";
import { personnelShadowDashboard } from "./personnelShadow";

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
  const [predictions, definitions, checkpoints, incidents, shadowCounts, strategyTips, personnel] = await Promise.all([
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
  ]);
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
    ...incidents.map((item) => ({ priority: item.severity === "CRITICAL" ? "NOW" : "WATCH", title: item.message, reason: "Otevreny provozni nebo modelovy incident", due: "nyni" })),
    ...checkpoints.filter((item) => item.pendingCount >= 5).map((item) => ({ priority: "NOW", title: `Zkontrolovat novy kalibracni report ${item.modelContext}`, reason: `${item.pendingCount} novych vysledku naplnilo bezpecny prepocet`, due: "po nejblizsim cron behu" })),
    ...strategies.filter((item) => item.nextMilestone != null && item.remaining <= 10).map((item) => ({ priority: "SOON", title: `Vyhodnotit ${item.title} pri ${item.nextMilestone} vysledcich`, reason: `Do milniku zbyva ${item.remaining}`, due: `pri n=${item.nextMilestone}` })),
    ...leagues.filter((item) => item.status === "REVIEW").map((item) => ({ priority: "WATCH", title: `Proverit kohortu ${item.name}`, reason: `Modelovy log-loss je o ${((item.modelLogLoss! - item.marketLogLoss!) * 100).toFixed(1)} bodu horsi nez trh (n=${item.n})`, due: "pred zmenou modelu" })),
  ];
  const shadow = Object.fromEntries(shadowCounts.map((row) => [row.status, row._count]));
  return { asOf: now, modelVersion: MODEL_VERSION, tasks, strategies, leagues, checkpoints, personnel, shadow: { total: Object.values(shadow).reduce((sum, value) => sum + value, 0), candidates: shadow.candidate ?? 0, watch: shadow.watch ?? 0 } };
}
