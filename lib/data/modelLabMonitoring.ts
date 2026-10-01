import { prisma } from "@/lib/db";
import { strategyCohort } from "../picks/strategyCohort";
import { loadModelStrategyLedger, MODEL_LAB_REPORT_VERSION } from "./modelStrategyLedger";
import { refreshPressurePerformance } from "./pressurePerformanceStore";
import { persistModelLabDetail } from "./modelLabDetailStore";
import { STRATEGY_CATALOG, modelLabSummary, resolveModelLabStatus } from "@/lib/picks/modelLab";
import { upsertIncident, resolveIncident } from "@/lib/operations";
import { PUBLIC_CLUB_LEAGUE_IDS } from "./catalog";
import { parseBooks, referenceLineQuote } from "@/lib/picks/books";
import { PINNACLE_FIRST_BOOKMAKERS } from "./apiFootball";
import { AUTONOMOUS_POLICY_VERSION, CORNERS_LIVE_COUNT_MODEL_VERSION, evaluateAutonomousTip } from "@/lib/picks/autonomousPortfolio";
import { COUNT_MARKET_SIGNAL_POLICY_VERSION } from "@/lib/picks/marketSignals";

function json(value: unknown) { return JSON.parse(JSON.stringify(value)); }

async function monitorCornerCapture(definitionId: string, modelVersion: number, startedAt: Date, now = new Date()) {
  const signals = await prisma.marketSignalSnapshot.findMany({
    where: {
      market: "CORNERS",
      policyVersion: COUNT_MARKET_SIGNAL_POLICY_VERSION,
      modelContext: "LEAGUE",
      modelVersion,
      countModelVersion: CORNERS_LIVE_COUNT_MODEL_VERSION,
      leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] },
      kickoff: { gt: new Date(now.getTime() + 15 * 60_000), lte: new Date(now.getTime() + 72 * 60 * 60_000) },
    },
    select: { fixtureId: true, side: true, line: true, modelProbability: true, series: true, kickoff: true },
  });
  if (!signals.length) {
    await resolveIncident(`model-corners:${definitionId}:capture-gap`);
    return 0;
  }
  const fixtureIds = signals.map((row) => row.fixtureId);
  const [predictions, evaluated] = await Promise.all([
    prisma.fixturePrediction.findMany({
      where: { fixtureId: { in: fixtureIds } },
      select: { fixtureId: true, oddsBooks: true, readinessSample: true, lowConfidence: true },
    }),
    prisma.autonomousTipSnapshot.findMany({
      where: { fixtureId: { in: fixtureIds }, strategy: "CORNERS", policyVersion: AUTONOMOUS_POLICY_VERSION.CORNERS, capturedAt: { gte: startedAt } },
      select: { fixtureId: true, status: true, sampleCount: true },
    }),
  ]);
  const predictionByFixture = new Map(predictions.map((row) => [row.fixtureId, row]));
  const evaluationByFixture = new Map(evaluated.map((row) => [row.fixtureId, row]));
  const missing = signals.filter((signal) => {
    const sampleCount = Array.isArray(signal.series) ? signal.series.length : 0;
    const existing = evaluationByFixture.get(signal.fixtureId);
    // Candidate i watch jsou platně zachycené výsledky rozhodovací brány. Mezera vzniká
    // pouze tehdy, když aktuální kurzový vzorek vůbec nebyl autonomní politikou vyhodnocen.
    if (existing && existing.sampleCount >= sampleCount) return false;
    if (signal.line == null || Math.abs(signal.line % 1) !== .5) return false;
    const prediction = predictionByFixture.get(signal.fixtureId);
    if (!prediction) return false;
    const side = signal.side === "UNDER" ? "under" : "over";
    const quote = referenceLineQuote(parseBooks(prediction.oddsBooks), "corners", signal.line, side, PINNACLE_FIRST_BOOKMAKERS);
    if (!quote) return false;
    return evaluateAutonomousTip({
      strategy: "CORNERS",
      modelProbability: signal.modelProbability,
      marketProbability: quote.probability,
      decimalOdds: quote.odds,
      readinessSample: prediction.readinessSample,
      lowConfidence: prediction.lowConfidence,
      sampleCount,
      minutesToKickoff: (signal.kickoff.getTime() - now.getTime()) / 60_000,
    }).status === "candidate";
  });
  const fingerprint = `model-corners:${definitionId}:capture-gap`;
  if (!missing.length) {
    await resolveIncident(fingerprint);
    return 0;
  }
  await upsertIncident({
    fingerprint,
    kind: "PORTFOLIO_CAPTURE_GAP",
    severity: "CRITICAL",
    message: `Rohový live test nezachytil ${missing.length} aktuálně způsobilých výběrů.`,
    details: { definitionId, fixtureIds: missing.map((row) => row.fixtureId), action: "Zkontrolovat kurzový cron a zachycení autonomního portfolia." },
  });
  return missing.length;
}

/** Denní kontrola pouze čte zmrazený ledger. Vytváří reporty a doporučení, nikdy nemění politiku. */
export async function monitorModelLab(options: { prepareDetails?: boolean } = {}) {
  let reports = 0, findings = 0;
  const now = new Date();
  // Milestone reports are immutable (the existing upsert has update: {}).
  // Read identities once; never rerun expensive summaries for an existing report.
  const existingReviews = await prisma.modelStrategyReviewReport.findMany({
    select: { definitionId: true, milestone: true },
  });
  const reviewKeys = new Set(existingReviews.map(row => `${row.definitionId}:${row.milestone}`));
  for (const context of ["LEAGUE", "EURO_CUP", "NATIONAL"] as const) {
  const { ledger } = await loadModelStrategyLedger(context);
  for (const item of STRATEGY_CATALOG) {
    const modelVersion = strategyCohort(item.strategy, context).modelVersion;
    const definition = await prisma.modelStrategyDefinition.upsert({
      where: { strategy_policyVersion_modelContext_modelVersion: { strategy: item.strategy, policyVersion: item.policyVersion, modelContext: context, modelVersion } },
      create: { strategy: item.strategy, policyVersion: item.policyVersion, market: item.market, modelContext: context, modelVersion, status: item.status, title: item.title, rules: { text: item.rules }, decisionCriteria: { text: item.decision }, minimumSample: item.minimumSample, startedAt: new Date() },
      update: { title: item.title, rules: { text: item.rules }, minimumSample: item.minimumSample },
    });
    const rows = ledger.filter(row => row.strategy === item.strategy && row.policyVersion === item.policyVersion);
    if (options.prepareDetails || process.env.RESOURCE_SAVING_READS_ENABLED === 'true') await persistModelLabDetail(context, item.strategy, item.policyVersion, rows, now);
    const summary = modelLabSummary(rows);
    const status = resolveModelLabStatus(item, definition.status);
    const card = { ...item, modelVersion, modelContext: context, status, reportVersion: MODEL_LAB_REPORT_VERSION, summary, currentCount: rows.filter(row => row.kickoff > now).length };
    const datasetCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.modelStrategyMetricSnapshot.upsert({
      where: { strategy_policyVersion_modelContext_modelVersion_datasetCutoff: { strategy: item.strategy, policyVersion: item.policyVersion, modelContext: context, modelVersion, datasetCutoff } },
      create: { strategy: item.strategy, policyVersion: item.policyVersion, modelContext: context, modelVersion, datasetCutoff, sampleSize: summary.probability.model.n, currentCount: card.currentCount, metrics: json(card) },
      update: { sampleSize: summary.probability.model.n, currentCount: card.currentCount, metrics: json(card), createdAt: now },
    });
    if (status === "RETIRED" || status === "REJECTED") continue;
    if (context === "LEAGUE" && item.strategy === "CORNERS") findings += await monitorCornerCapture(definition.id, definition.modelVersion, definition.startedAt);
    const settled = summary.portfolio.settled;
    for (const milestone of [50, 100, 200]) {
      if (settled < milestone) continue;
      if (reviewKeys.has(`${definition.id}:${milestone}`)) { reports++; continue; }
      const ordered = rows.filter((row) => row.market === "CORNERS" || row.market === "CARDS" || row.market === "FOULS" ? row.actualCount != null : row.homeGoals != null && row.awayGoals != null).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime()).slice(0, milestone);
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
  }
  await refreshPressurePerformance(now);
  return { reports, findings };
}
