import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { publicCache } from "@/lib/cacheHeaders";
import { MODEL_VERSION } from "@/lib/data/modelVersion";
import { STRATEGY_CATALOG, modelLabSegments, modelLabSummary, type ModelLabContext, type ModelLabLedgerRow, type ModelLabStatus } from "@/lib/picks/modelLab";
import { binaryOutcome, FINAL_STATUSES } from "@/lib/picks/evaluation";
import { requestDiagnostics } from "@/lib/httpDiagnostics";

const querySchema = z.object({
  context: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]).default("LEAGUE"),
  strategy: z.string().max(40).optional(),
  detail: z.coerce.boolean().default(false),
});

export const dynamic = "force-dynamic";

const json = (value: unknown) => JSON.parse(JSON.stringify(value));

async function cachedSummary(context: ModelLabContext) {
  const snapshots = await prisma.modelStrategyMetricSnapshot.findMany({
    where: { modelContext: context, modelVersion: MODEL_VERSION },
    orderBy: { createdAt: "desc" },
    take: STRATEGY_CATALOG.length * 2,
  });
  const byKey = new Map<string, (typeof snapshots)[number]>();
  for (const row of snapshots) {
    const key = `${row.strategy}:${row.policyVersion}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  if (!STRATEGY_CATALOG.every((item) => byKey.has(`${item.strategy}:${item.policyVersion}`))) return null;
  const now = new Date();
  const current = await prisma.autonomousTipSnapshot.groupBy({
    by: ["strategy", "policyVersion"],
    where: { modelContext: context, status: "candidate", settlementStatus: "PENDING", kickoff: { gte: new Date(now.getTime() - 4 * 60 * 60_000) } },
    _count: { _all: true },
  });
  const currentByKey = new Map(current.map((row) => [`${row.strategy}:${row.policyVersion}`, row._count._all]));
  return STRATEGY_CATALOG.map((item) => {
    const stored = byKey.get(`${item.strategy}:${item.policyVersion}`)!;
    const card = stored.metrics as Record<string, unknown>;
    return { ...card, currentCount: ["ONE_X_TWO", "OVER_25", "BTTS_YES", "CORNERS"].includes(item.strategy) ? currentByKey.get(`${item.strategy}:${item.policyVersion}`) ?? 0 : null };
  });
}

export async function GET(request: Request) {
  const diagnostic = requestDiagnostics(request);
  if (!allowRequest(`model-lab:${clientKey(request)}`, 40, 60_000)) return tooMany();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný filtr" }, { status: 400 });
  let pro = false;
  if (parsed.data.detail) {
    const user = await getCurrentUser();
    pro = getEntitlement(user).pro;
    if (!pro) return NextResponse.json({ locked: true }, { status: 403 });
  }
  try {
    const context = parsed.data.context as ModelLabContext;
    if (!parsed.data.detail && !parsed.data.strategy) {
      const cards = await cachedSummary(context);
      if (cards) return diagnostic.json({ context, cards, snapshot: true }, { headers: publicCache(300, 900) });
    }
    const teamMarkets = ["TEAM_HOME_05", "TEAM_HOME_15", "TEAM_AWAY_05", "TEAM_AWAY_15"];
    const [tips, teamSignals, overrides, foulPredictions] = await Promise.all([
      prisma.autonomousTipSnapshot.findMany({
        where: { status: "candidate", modelContext: context, ...(parsed.data.strategy ? { strategy: parsed.data.strategy } : {}) },
        orderBy: { qualifiedAt: "asc" },
      }),
      parsed.data.strategy && parsed.data.strategy !== "TEAM_GOALS" ? Promise.resolve([]) : prisma.marketSignalSnapshot.findMany({ where: { modelContext: context, market: { in: teamMarkets } }, orderBy: { openedAt: "asc" } }),
      prisma.modelStrategyDefinition.findMany({ where: { modelContext: context } }),
      context !== "LEAGUE" || (parsed.data.strategy && parsed.data.strategy !== "FOULS") ? Promise.resolve([]) : prisma.fixturePrediction.findMany({ where: { modelContext: context, homeGoals: { not: null }, awayGoals: { not: null }, lambdaFoulsHome: { not: null }, lambdaFoulsAway: { not: null } }, select: { fixtureId: true, homeTeamId: true, awayTeamId: true, lambdaFoulsHome: true, lambdaFoulsAway: true, foulModelVersion: true } }),
    ]);
    const fixtureIds = [...new Set([...tips.map((row) => row.fixtureId), ...teamSignals.map((row) => row.fixtureId)])];
    const results = fixtureIds.length ? await prisma.fixturePrediction.findMany({
      where: { fixtureId: { in: fixtureIds } },
      select: { fixtureId: true, homeGoals: true, awayGoals: true, status: true },
    }) : [];
    const byFixture = new Map(results.map((row) => [row.fixtureId, row]));
    const cornerTips = tips.filter((row) => row.market === "CORNERS");
    const cornerStats = cornerTips.length ? await prisma.matchStatCache.findMany({
      where: { fixtureId: { in: cornerTips.map((row) => row.fixtureId) } },
      select: { fixtureId: true, teamId: true, corners: true },
    }) : [];
    const actualCorners = new Map<number, number>();
    for (const tip of cornerTips) {
      const home = cornerStats.find((row) => row.fixtureId === tip.fixtureId && row.teamId === tip.homeTeamId)?.corners;
      const away = cornerStats.find((row) => row.fixtureId === tip.fixtureId && row.teamId === tip.awayTeamId)?.corners;
      if (home != null && away != null) actualCorners.set(tip.fixtureId, home + away);
    }
    const ledger: ModelLabLedgerRow[] = tips.map((row) => ({
      ...row,
      homeGoals: byFixture.get(row.fixtureId)?.homeGoals ?? null,
      awayGoals: byFixture.get(row.fixtureId)?.awayGoals ?? null,
      actualCount: row.actualCount ?? actualCorners.get(row.fixtureId) ?? null,
    }));
    for (const signal of teamSignals) {
      const prediction = byFixture.get(signal.fixtureId);
      // Cena musí pocházet výhradně ze zmrazeného signálu. V1 ji nemá a
      // zůstává pouze sportovní diagnostikou bez retrospektivního ROI.
      ledger.push({ id: signal.id, fixtureId: signal.fixtureId, leagueId: signal.leagueId, kickoff: signal.kickoff, strategy: "TEAM_GOALS", policyVersion: signal.policyVersion, market: signal.market, side: signal.side, line: signal.line, modelProbability: signal.modelProbability, marketProbability: signal.openMarketProbability, decimalOdds: signal.policyVersion >= 2 ? signal.decimalOdds : null, stake: 1, modelContext: signal.modelContext, modelVersion: signal.modelVersion, qualifiedAt: signal.openedAt, closingMarketProbability: signal.closeMarketProbability, closedAt: signal.closedAt, homeGoals: prediction?.homeGoals ?? null, awayGoals: prediction?.awayGoals ?? null });
    }
    let foulResearch: { n: number; mae: number | null; bias: number | null; version: number | null } | null = null;
    if (foulPredictions.length) {
      const stats = await prisma.matchStatCache.findMany({ where: { fixtureId: { in: foulPredictions.map((row) => row.fixtureId) } }, select: { fixtureId: true, teamId: true, fouls: true } });
      const byKey = new Map(stats.map((row) => [`${row.fixtureId}:${row.teamId}`, row.fouls]));
      const values = foulPredictions.flatMap((row) => { const home = byKey.get(`${row.fixtureId}:${row.homeTeamId}`), away = byKey.get(`${row.fixtureId}:${row.awayTeamId}`); if (home == null || away == null || row.lambdaFoulsHome == null || row.lambdaFoulsAway == null) return []; const error = row.lambdaFoulsHome + row.lambdaFoulsAway - home - away; return [{ error, version: row.foulModelVersion }]; });
      foulResearch = { n: values.length, mae: values.length ? values.reduce((sum, row) => sum + Math.abs(row.error), 0) / values.length : null, bias: values.length ? values.reduce((sum, row) => sum + row.error, 0) / values.length : null, version: values.at(-1)?.version ?? null };
    }
    const overrideByKey = new Map(overrides.map((row) => [`${row.strategy}:${row.policyVersion}`, row]));
    const liveFrom = new Date(Date.now() - 4 * 60 * 60_000);
    const cards = STRATEGY_CATALOG.filter((item) => !parsed.data.strategy || item.strategy === parsed.data.strategy).map((item) => {
      const rows = ledger.filter((row) => row.strategy === item.strategy && row.policyVersion === item.policyVersion);
      const override = overrideByKey.get(`${item.strategy}:${item.policyVersion}`);
      const summary = modelLabSummary(rows);
      return {
        ...item,
        modelContext: context,
        modelVersion: override?.modelVersion ?? MODEL_VERSION,
        status: (override?.status as ModelLabStatus | undefined) ?? item.status,
        definitionId: override?.id ?? null,
        currentCount: ["ONE_X_TWO", "OVER_25", "BTTS_YES", "CORNERS"].includes(item.strategy)
          ? rows.filter((row) => row.kickoff >= liveFrom && !FINAL_STATUSES.has(byFixture.get(row.fixtureId)?.status ?? "") && binaryOutcome(row.market, row.side, row.homeGoals, row.awayGoals, row.line, row.actualCount ?? null) == null).length
          : null,
        summary: item.strategy === "FOULS" && foulResearch ? { ...summary, verdict: foulResearch.bias == null ? "Fauly zatím nemají skutečná data." : `MAE ${foulResearch.mae!.toFixed(2)} · bias ${foulResearch.bias >= 0 ? "+" : ""}${foulResearch.bias.toFixed(2)} faulu.` } : summary,
        research: item.strategy === "FOULS" ? foulResearch : null,
      };
    });
    const detailRows = parsed.data.detail && pro ? ledger.slice(-100).reverse().map((row) => ({ ...row, kickoff: row.kickoff.toISOString(), qualifiedAt: row.qualifiedAt?.toISOString() ?? null, closedAt: row.closedAt?.toISOString() ?? null })) : undefined;
    const segments = parsed.data.detail && pro && parsed.data.strategy ? modelLabSegments(ledger.filter((row) => row.strategy === parsed.data.strategy)) : undefined;
    if (!parsed.data.detail && !parsed.data.strategy) {
      const now = new Date();
      const datasetCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      await Promise.all(cards.map((card) => prisma.modelStrategyMetricSnapshot.upsert({
        where: { strategy_policyVersion_modelContext_modelVersion_datasetCutoff: { strategy: card.strategy, policyVersion: card.policyVersion, modelContext: context, modelVersion: card.modelVersion, datasetCutoff } },
        create: { strategy: card.strategy, policyVersion: card.policyVersion, modelContext: context, modelVersion: card.modelVersion, datasetCutoff, sampleSize: card.research?.n ?? card.summary.probability.model.n, currentCount: card.currentCount ?? 0, metrics: json(card) },
        update: { sampleSize: card.research?.n ?? card.summary.probability.model.n, currentCount: card.currentCount ?? 0, metrics: json(card), createdAt: now },
      })));
    }
    return diagnostic.json({ context, cards, detailRows, segments }, { headers: parsed.data.detail ? { "Cache-Control": "private, no-store" } : publicCache(300, 900) });
  } catch (error) {
    logError("api/picks/model-lab", error);
    return NextResponse.json({ error: "Model Lab se nepodařilo načíst" }, { status: 502 });
  }
}
