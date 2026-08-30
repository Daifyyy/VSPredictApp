import { prisma } from "@/lib/db";
import { MODEL_VERSION } from "./modelVersion";
import { STRATEGY_CATALOG, modelLabSummary, type ModelLabLedgerRow } from "@/lib/picks/modelLab";
import { upsertIncident, resolveIncident } from "@/lib/operations";

function json(value: unknown) { return JSON.parse(JSON.stringify(value)); }

async function ledgerFor(strategy: string, policyVersion: number): Promise<ModelLabLedgerRow[]> {
  const tips = await prisma.autonomousTipSnapshot.findMany({ where: { strategy, policyVersion, status: "candidate", modelContext: "LEAGUE" }, orderBy: { qualifiedAt: "asc" } });
  const results = await prisma.fixturePrediction.findMany({ where: { fixtureId: { in: [...new Set(tips.map((row) => row.fixtureId))] } }, select: { fixtureId: true, homeGoals: true, awayGoals: true } });
  const byFixture = new Map(results.map((row) => [row.fixtureId, row]));
  return tips.map((row) => ({ ...row, homeGoals: byFixture.get(row.fixtureId)?.homeGoals ?? null, awayGoals: byFixture.get(row.fixtureId)?.awayGoals ?? null }));
}

/** Denní kontrola pouze čte zmrazený ledger. Vytváří reporty a doporučení, nikdy nemění politiku. */
export async function monitorModelLab() {
  let reports = 0, findings = 0;
  for (const item of STRATEGY_CATALOG.filter((entry) => entry.status === "LIVE_TEST")) {
    const definition = await prisma.modelStrategyDefinition.upsert({
      where: { strategy_policyVersion_modelContext_modelVersion: { strategy: item.strategy, policyVersion: item.policyVersion, modelContext: "LEAGUE", modelVersion: MODEL_VERSION } },
      create: { strategy: item.strategy, policyVersion: item.policyVersion, market: item.market, modelContext: "LEAGUE", modelVersion: MODEL_VERSION, status: item.status, title: item.title, rules: { text: item.rules }, decisionCriteria: { text: item.decision }, minimumSample: item.minimumSample, startedAt: new Date() },
      update: { title: item.title, rules: { text: item.rules }, decisionCriteria: { text: item.decision }, minimumSample: item.minimumSample },
    });
    const rows = await ledgerFor(item.strategy, item.policyVersion);
    const summary = modelLabSummary(rows);
    const settled = summary.portfolio.settled;
    for (const milestone of [50, 100, 200]) {
      if (settled < milestone) continue;
      const ordered = rows.filter((row) => row.homeGoals != null && row.awayGoals != null).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime()).slice(0, milestone);
      const reportSummary = modelLabSummary(ordered);
      await prisma.modelStrategyReviewReport.upsert({
        where: { definitionId_milestone: { definitionId: definition.id, milestone } },
        create: { definitionId: definition.id, milestone, datasetFrom: ordered[0]?.kickoff, datasetTo: ordered.at(-1)?.kickoff, trainingTo: ordered[Math.max(0, Math.floor(ordered.length * .7) - 1)]?.kickoff, holdoutFrom: ordered[Math.floor(ordered.length * .7)]?.kickoff, sampleSize: reportSummary.portfolio.settled, pricedSample: reportSummary.portfolio.staked, closingSample: reportSummary.portfolio.clvComplete, metrics: json({ portfolio: reportSummary.portfolio, probability: reportSummary.probability, holdout: reportSummary.holdout }), gates: json(reportSummary.gates), recommendation: reportSummary.recommendedStatus },
        update: {},
      });
      reports++;
    }
    if (settled < 100) continue;
    const recent = modelLabSummary(rows.slice(-50));
    const baseline = modelLabSummary(rows.slice(0, -50));
    const recentLoss = recent.probability.model.logLoss;
    const baselineLoss = baseline.probability.model.logLoss;
    const degraded = recentLoss != null && baselineLoss != null && recentLoss > baselineLoss * 1.1;
    const existing = await prisma.modelDegradationIncident.findFirst({ where: { definitionId: definition.id, metric: "LOG_LOSS", status: "OPEN" }, orderBy: { lastDetectedAt: "desc" } });
    const fingerprint = `model-degradation:${definition.id}:logloss`;
    if (degraded) {
      const incident = existing
        ? await prisma.modelDegradationIncident.update({ where: { id: existing.id }, data: { baselineValue: baselineLoss, recentValue: recentLoss, evidence: json({ baseline: baseline.probability.model, recent: recent.probability.model }), consecutive: { increment: 1 }, lastDetectedAt: new Date() } })
        : await prisma.modelDegradationIncident.create({ data: { definitionId: definition.id, metric: "LOG_LOSS", windowSize: 50, baselineValue: baselineLoss, recentValue: recentLoss, evidence: json({ baseline: baseline.probability.model, recent: recent.probability.model }), action: "Otevřít kohortu a zkontrolovat datovou pipeline" } });
      findings++;
      if (incident.consecutive >= 2) await upsertIncident({ fingerprint, kind: "MODEL_DEGRADATION", severity: "CRITICAL", message: `${item.title}: log-loss posledních 50 prognóz se zhoršil o více než 10 %.`, details: { definitionId: definition.id, baselineLoss, recentLoss, action: incident.action } });
    } else {
      if (existing) await prisma.modelDegradationIncident.update({ where: { id: existing.id }, data: { status: "RESOLVED", resolvedAt: new Date(), lastDetectedAt: new Date() } });
      await resolveIncident(fingerprint);
    }
  }
  return { reports, findings };
}
