import { prisma } from "../lib/db";
import { MODEL_VERSION } from "../lib/data/modelVersion";
import { isCurrentContextVersion, modelContextForLeague, type ModelContext } from "../lib/data/modelContext";
import { getSettledPredictions } from "../lib/data/predictionStore";
import { isPublicCompetition } from "../lib/data/catalog";
import { rollingBinaryCalibration, rollingOutcomeCalibration } from "../lib/picks/rollingCalibration";
import { rollingGoalDistributionCalibration } from "../lib/picks/goalDistributionCalibration";

const persist = process.argv.includes("--persist");
const requested = process.argv.find((arg) => arg.startsWith("--context="))?.split("=")[1] ?? "LEAGUE";
if (!["LEAGUE", "EURO_CUP", "NATIONAL"].includes(requested)) throw new Error("Neplatný modelový kontext");
const context = requested as ModelContext;

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

async function persistReport(input: {
  market: string;
  method: string;
  parameters: unknown;
  report: { folds: unknown[]; baseline: unknown; calibrated: unknown; gates: Record<string, unknown>; accepted: boolean; atGridEdge?: boolean };
  rows: Array<{ kickoff: string }>;
}) {
  const accepted = input.report.accepted && !input.report.atGridEdge;
  await prisma.$transaction(async (tx) => {
    const latest = await tx.calibrationDefinition.findFirst({
      where: { market: input.market, modelContext: context, sourceModelVersion: MODEL_VERSION },
      orderBy: { calibrationVersion: "desc" },
      select: { calibrationVersion: true },
    });
    const definition = await tx.calibrationDefinition.create({
      data: {
        market: input.market,
        modelContext: context,
        sourceModelVersion: MODEL_VERSION,
        calibrationVersion: (latest?.calibrationVersion ?? 0) + 1,
        status: accepted ? "SHADOW" : "REJECTED",
        method: input.method,
        parameters: json(input.parameters),
        datasetFrom: input.rows[0] ? new Date(input.rows[0].kickoff) : null,
        datasetTo: input.rows.at(-1) ? new Date(input.rows.at(-1)!.kickoff) : null,
      },
    });
    await tx.calibrationReviewReport.create({
      data: {
        definitionId: definition.id,
        datasetCutoff: input.rows.at(-1) ? new Date(input.rows.at(-1)!.kickoff) : new Date(0),
        sampleSize: input.rows.length,
        foldCount: input.report.folds.length,
        metrics: json({ baseline: input.report.baseline, calibrated: input.report.calibrated, folds: input.report.folds }),
        gates: json({ ...input.report.gates, atGridEdge: input.report.atGridEdge ?? false }),
        recommendation: accepted ? "SHADOW" : "REJECT",
      },
    });
  });
}

async function main() {
  const stored = await getSettledPredictions(MODEL_VERSION);
  const rows = stored
    .filter(isCurrentContextVersion)
    .filter((row) => isPublicCompetition(row.leagueId) && modelContextForLeague(row.leagueId) === context)
    .filter((row) => row.homeGoals != null && row.awayGoals != null)
    .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  const outcome = rollingOutcomeCalibration(rows);
  const over = rollingBinaryCalibration(rows.map((row) => ({ probability: row.over25, outcome: row.homeGoals! + row.awayGoals! > 2, kickoff: row.kickoff })));
  const btts = rollingBinaryCalibration(rows.map((row) => ({ probability: row.bttsYes, outcome: row.homeGoals! > 0 && row.awayGoals! > 0, kickoff: row.kickoff })));
  const goalDistribution = rollingGoalDistributionCalibration(rows);
  const reports = [
    { market: "1X2", method: "OUTCOME_PLATT", parameters: outcome.finalParameters, report: outcome },
    { market: "OVER_25", method: "BINARY_LOGISTIC", parameters: over.finalParameters, report: over },
    { market: "BTTS", method: "BINARY_LOGISTIC", parameters: btts.finalParameters, report: btts },
    { market: "GOAL_DISTRIBUTION", method: "GOAL_DISTRIBUTION", parameters: goalDistribution.finalParameters, report: goalDistribution },
  ];

  process.stdout.write(`${JSON.stringify({ context, modelVersion: MODEL_VERSION, dataset: { n: rows.length, from: rows[0]?.kickoff ?? null, to: rows.at(-1)?.kickoff ?? null }, reports }, null, 2)}\n`);
  if (persist) for (const report of reports) await persistReport({ ...report, rows });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
