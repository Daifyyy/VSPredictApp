import "server-only";
import { prisma } from "@/lib/db";
import { PUBLIC_CLUB_LEAGUE_IDS } from "./catalog";
import { MODEL_CONTEXT_VERSION } from "./modelContext";
import { MODEL_VERSION } from "./modelVersion";
import { evaluateModelRows, MODEL_EVALUATION_VERSION, type ModelEvaluationRow } from "@/lib/picks/modelEvaluation";

const FINISHED = ["FT", "AET", "PEN"];
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

export async function captureModelEvaluationSnapshots(now = new Date()) {
  const datasetCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = await prisma.fixturePrediction.findMany({
    where: { modelVersion: MODEL_VERSION, modelContext: "LEAGUE", contextVersion: MODEL_CONTEXT_VERSION.LEAGUE, available: true, leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] }, status: { in: FINISHED }, homeGoals: { not: null }, awayGoals: { not: null }, kickoff: { lt: datasetCutoff } },
    orderBy: { kickoff: "asc" },
    select: { fixtureId: true, leagueId: true, kickoff: true, homeWin: true, draw: true, awayWin: true, homeGoals: true, awayGoals: true, oddsHome: true, oddsDraw: true, oddsAway: true, oddsCloseHome: true, oddsCloseDraw: true, oddsCloseAway: true },
  });
  const last30From = new Date(datasetCutoff.getTime() - 30 * 86_400_000);
  const holdoutStart = Math.floor(rows.length * .7);
  const windows = [
    { windowType: "ALL", leagueId: 0, rows },
    { windowType: "LAST_30_DAYS", leagueId: 0, rows: rows.filter((row) => row.kickoff >= last30From) },
    { windowType: "LAST_100", leagueId: 0, rows: rows.slice(-100) },
    { windowType: "HOLDOUT_30_PERCENT", leagueId: 0, rows: rows.slice(holdoutStart) },
    ...PUBLIC_CLUB_LEAGUE_IDS.map((leagueId) => ({ windowType: "LEAGUE_ALL", leagueId, rows: rows.filter((row) => row.leagueId === leagueId) })),
  ];
  for (const window of windows) {
    const result = evaluateModelRows(window.rows as ModelEvaluationRow[]);
    const data = {
      sampleSize: result.sampleSize, fromKickoff: result.fromKickoff, toKickoff: result.toKickoff,
      modelAccuracy: result.model.accuracy, modelLogLoss: result.model.logLoss, modelBrier: result.model.brier, modelEce: result.model.ece,
      openingSampleSize: result.opening.n, openingAccuracy: result.opening.accuracy, openingLogLoss: result.opening.logLoss, openingBrier: result.opening.brier, openingEce: result.opening.ece,
      closingSampleSize: result.closing.n, closingAccuracy: result.closing.accuracy, closingLogLoss: result.closing.logLoss, closingBrier: result.closing.brier, closingEce: result.closing.ece,
      dataQuality: json(result.dataQuality),
    };
    await prisma.modelEvaluationSnapshot.upsert({
      where: { modelVersion_modelContext_contextVersion_evaluationVersion_datasetCutoff_windowType_leagueId: { modelVersion: MODEL_VERSION, modelContext: "LEAGUE", contextVersion: MODEL_CONTEXT_VERSION.LEAGUE, evaluationVersion: MODEL_EVALUATION_VERSION, datasetCutoff, windowType: window.windowType, leagueId: window.leagueId } },
      create: { modelVersion: MODEL_VERSION, modelContext: "LEAGUE", contextVersion: MODEL_CONTEXT_VERSION.LEAGUE, evaluationVersion: MODEL_EVALUATION_VERSION, datasetCutoff, windowType: window.windowType, leagueId: window.leagueId, ...data },
      update: data,
    });
  }
  return { snapshots: windows.length, rows: rows.length, cutoff: datasetCutoff };
}
