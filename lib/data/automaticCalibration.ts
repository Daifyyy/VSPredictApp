import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MODEL_VERSION } from "@/lib/data/modelVersion";
import { isCurrentContextVersion, modelContextForLeague, type ModelContext } from "@/lib/data/modelContext";
import { isPublicCompetition } from "@/lib/data/catalog";
import { getSettledPredictions } from "@/lib/data/predictionStore";
import { buildCalibrationSuite, calibrationCandidateStatus, calibrationTrigger } from "@/lib/picks/calibrationSuite";

const COHORT = "GOALS";
const TRIGGER_SIZE = 5;
const LEASE_MS = 2 * 60_000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export interface AutomaticCalibrationResult {
  context: ModelContext;
  modelVersion: number;
  eligible: number;
  previouslyEvaluated: number;
  newResults: number;
  pending: number;
  ran: boolean;
  locked?: boolean;
  duplicate?: boolean;
  definitions: Array<{ market: string; status: string; calibrationVersion: number }>;
}

function datasetHash(rows: Array<{ fixtureId: number; homeGoals: number | null; awayGoals: number | null }>) {
  const payload = rows.map((row) => `${row.fixtureId}:${row.homeGoals}:${row.awayGoals}`).join("|");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Bezpečný automatický přepočet. Pět výsledků pouze otevře bránu; fit i holdout vždy
 * používají celou časově seřazenou platnou kohortu. Produkční konstanty se zde nemění.
 */
export async function runAutomaticCalibration(context: ModelContext): Promise<AutomaticCalibrationResult> {
  const all = await getSettledPredictions(MODEL_VERSION);
  const rows = all
    .filter(isCurrentContextVersion)
    .filter((row) => isPublicCompetition(row.leagueId) && modelContextForLeague(row.leagueId) === context)
    .filter((row) => row.available && row.homeGoals != null && row.awayGoals != null)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime() || a.fixtureId - b.fixtureId);

  const checkpoint = await prisma.calibrationCheckpoint.upsert({
    where: { cohort_modelContext_sourceModelVersion: { cohort: COHORT, modelContext: context, sourceModelVersion: MODEL_VERSION } },
    create: { cohort: COHORT, modelContext: context, sourceModelVersion: MODEL_VERSION },
    update: {},
  });
  const trigger = calibrationTrigger(rows.length, checkpoint.evaluatedCount, TRIGGER_SIZE);
  if (!trigger.shouldRun) {
    await prisma.calibrationCheckpoint.update({ where: { id: checkpoint.id }, data: { pendingCount: trigger.pending } });
    return {
      context,
      modelVersion: MODEL_VERSION,
      eligible: rows.length,
      previouslyEvaluated: checkpoint.evaluatedCount,
      newResults: trigger.pending,
      pending: trigger.pending,
      ran: false,
      definitions: [],
    };
  }

  const now = new Date();
  const claimed = await prisma.calibrationCheckpoint.updateMany({
    where: {
      id: checkpoint.id,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil: new Date(now.getTime() + LEASE_MS), pendingCount: trigger.pending },
  });
  if (!claimed.count) return {
    context,
    modelVersion: MODEL_VERSION,
    eligible: rows.length,
    previouslyEvaluated: checkpoint.evaluatedCount,
    newResults: trigger.pending,
    pending: trigger.pending,
    ran: false,
    locked: true,
    definitions: [],
  };

  const hash = datasetHash(rows);
  const cutoff = new Date(rows.at(-1)!.kickoff);
  try {
    const existing = await prisma.calibrationEvaluationBatch.findUnique({
      where: { cohort_modelContext_sourceModelVersion_datasetHash: { cohort: COHORT, modelContext: context, sourceModelVersion: MODEL_VERSION, datasetHash: hash } },
    });
    if (existing) {
      await prisma.calibrationCheckpoint.update({
        where: { id: checkpoint.id },
        data: { evaluatedCount: rows.length, pendingCount: 0, datasetCutoff: cutoff, datasetHash: hash, lastRunAt: now, leaseUntil: null },
      });
      return { context, modelVersion: MODEL_VERSION, eligible: rows.length, previouslyEvaluated: checkpoint.evaluatedCount, newResults: trigger.pending, pending: 0, ran: false, duplicate: true, definitions: [] };
    }

    const reports = buildCalibrationSuite(rows);
    const definitions = await prisma.$transaction(async (tx) => {
      const saved: AutomaticCalibrationResult["definitions"] = [];
      for (const item of reports) {
        const accepted = item.report.accepted && !item.report.atGridEdge;
        const [latest, active] = await Promise.all([
          tx.calibrationDefinition.findFirst({
            where: { market: item.market, modelContext: context, sourceModelVersion: MODEL_VERSION },
            orderBy: { calibrationVersion: "desc" },
            select: { calibrationVersion: true },
          }),
          tx.calibrationDefinition.findFirst({
            where: { market: item.market, modelContext: context, sourceModelVersion: MODEL_VERSION, status: "SHADOW" },
            select: { id: true },
          }),
        ]);
        const status = calibrationCandidateStatus(accepted, Boolean(active));
        const calibrationVersion = (latest?.calibrationVersion ?? 0) + 1;
        const definition = await tx.calibrationDefinition.create({
          data: {
            market: item.market,
            modelContext: context,
            sourceModelVersion: MODEL_VERSION,
            calibrationVersion,
            status,
            method: item.method,
            parameters: json(item.parameters),
            datasetFrom: rows[0] ? new Date(rows[0].kickoff) : null,
            datasetTo: cutoff,
            acceptedAt: status === "SHADOW" ? now : null,
          },
        });
        await tx.calibrationReviewReport.create({
          data: {
            definitionId: definition.id,
            datasetCutoff: cutoff,
            sampleSize: rows.length,
            foldCount: item.report.folds.length,
            metrics: json({ baseline: item.report.baseline, calibrated: item.report.calibrated, folds: item.report.folds }),
            gates: json({ ...item.report.gates, atGridEdge: item.report.atGridEdge ?? false }),
            recommendation: status,
          },
        });
        saved.push({ market: item.market, status, calibrationVersion });
      }
      await tx.calibrationEvaluationBatch.create({
        data: {
          checkpointId: checkpoint.id,
          cohort: COHORT,
          modelContext: context,
          sourceModelVersion: MODEL_VERSION,
          datasetCutoff: cutoff,
          datasetHash: hash,
          sampleSize: rows.length,
          newResults: trigger.pending,
          status: "COMPLETED",
          summary: json({ definitions: saved }),
          startedAt: now,
          finishedAt: new Date(),
        },
      });
      await tx.calibrationCheckpoint.update({
        where: { id: checkpoint.id },
        data: { evaluatedCount: rows.length, pendingCount: 0, datasetCutoff: cutoff, datasetHash: hash, lastRunAt: now, leaseUntil: null },
      });
      return saved;
    }, { maxWait: 5_000, timeout: 20_000 });
    return { context, modelVersion: MODEL_VERSION, eligible: rows.length, previouslyEvaluated: checkpoint.evaluatedCount, newResults: trigger.pending, pending: 0, ran: true, definitions };
  } catch (error) {
    await prisma.calibrationCheckpoint.update({ where: { id: checkpoint.id }, data: { leaseUntil: null } }).catch(() => {});
    throw error;
  }
}
