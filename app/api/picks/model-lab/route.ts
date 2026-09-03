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
import { bestLinePrice, parseBooks } from "@/lib/picks/books";
import { binaryOutcome, FINAL_STATUSES } from "@/lib/picks/evaluation";

const querySchema = z.object({
  context: z.enum(["LEAGUE", "EURO_CUP", "NATIONAL"]).default("LEAGUE"),
  strategy: z.string().max(40).optional(),
  detail: z.coerce.boolean().default(false),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!allowRequest(`model-lab:${clientKey(request)}`, 40, 60_000)) return tooMany();
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Neplatný filtr" }, { status: 400 });
  const user = await getCurrentUser();
  const pro = getEntitlement(user).pro;
  if (parsed.data.detail && !pro) return NextResponse.json({ locked: true }, { status: 403 });
  try {
    const context = parsed.data.context as ModelLabContext;
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
      select: { fixtureId: true, homeGoals: true, awayGoals: true, status: true, oddsBooks: true },
    }) : [];
    const byFixture = new Map(results.map((row) => [row.fixtureId, row]));
    const ledger: ModelLabLedgerRow[] = tips.map((row) => ({
      ...row,
      homeGoals: byFixture.get(row.fixtureId)?.homeGoals ?? null,
      awayGoals: byFixture.get(row.fixtureId)?.awayGoals ?? null,
    }));
    for (const signal of teamSignals) {
      const prediction = byFixture.get(signal.fixtureId);
      const lineMarket = signal.market.startsWith("TEAM_HOME") ? "totalHome" : "totalAway";
      const price = signal.line == null ? null : bestLinePrice(parseBooks(prediction?.oddsBooks), lineMarket, signal.line, "over");
      ledger.push({ id: signal.id, fixtureId: signal.fixtureId, leagueId: signal.leagueId, kickoff: signal.kickoff, strategy: "TEAM_GOALS", policyVersion: signal.policyVersion, market: signal.market, side: signal.side, line: signal.line, modelProbability: signal.modelProbability, marketProbability: signal.openMarketProbability, decimalOdds: price?.odds ?? null, stake: 1, modelContext: signal.modelContext, modelVersion: signal.modelVersion, qualifiedAt: signal.openedAt, closingMarketProbability: signal.closeMarketProbability, closedAt: signal.closedAt, homeGoals: prediction?.homeGoals ?? null, awayGoals: prediction?.awayGoals ?? null });
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
        currentCount: ["ONE_X_TWO", "OVER_25", "BTTS_YES"].includes(item.strategy)
          ? rows.filter((row) => row.kickoff >= liveFrom && !FINAL_STATUSES.has(byFixture.get(row.fixtureId)?.status ?? "") && binaryOutcome(row.market, row.side, row.homeGoals, row.awayGoals, row.line) == null).length
          : null,
        summary: item.strategy === "FOULS" && foulResearch ? { ...summary, verdict: foulResearch.bias == null ? "Fauly zatím nemají skutečná data." : `MAE ${foulResearch.mae!.toFixed(2)} · bias ${foulResearch.bias >= 0 ? "+" : ""}${foulResearch.bias.toFixed(2)} faulu.` } : summary,
        research: item.strategy === "FOULS" ? foulResearch : null,
      };
    });
    const detailRows = parsed.data.detail && pro ? ledger.slice(-100).reverse().map((row) => ({ ...row, kickoff: row.kickoff.toISOString(), qualifiedAt: row.qualifiedAt?.toISOString() ?? null, closedAt: row.closedAt?.toISOString() ?? null })) : undefined;
    const segments = parsed.data.detail && pro && parsed.data.strategy ? modelLabSegments(ledger.filter((row) => row.strategy === parsed.data.strategy)) : undefined;
    return NextResponse.json({ context, cards, detailRows, segments }, { headers: parsed.data.detail ? { "Cache-Control": "private, no-store" } : publicCache(300, 900) });
  } catch (error) {
    logError("api/picks/model-lab", error);
    return NextResponse.json({ error: "Model Lab se nepodařilo načíst" }, { status: 502 });
  }
}
