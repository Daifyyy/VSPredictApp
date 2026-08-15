import { NextResponse } from "next/server";
import { getPublishedPredictionRows, getSettledPredictionRows } from "@/lib/data/repository";
import {
  backtestRule,
  computeBenchmarkTrackRecord,
  computeTrackRecord,
} from "@/lib/picks/trackRecord";
import { computeMarketBenchmark } from "@/lib/picks/market";
import { computeReliability } from "@/lib/picks/reliability";
import { clvSideOf, summarizeClv } from "@/lib/picks/clv";
import { evaluateRule, ruleSchema } from "@/lib/picks/rules";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { publicCache } from "@/lib/cacheHeaders";
import { logError } from "@/lib/logError";
import { isEuroCupLeague } from "@/lib/data/catalog";
import { computeCountModelAccuracy, computePublishedTipRecord } from "@/lib/picks/performance";
import { getCachedCountTotals } from "@/lib/data/cache";
import { isRealDataConfigured } from "@/lib/db";
import { marketClvSummaries } from "@/lib/data/marketSignalStats";

// Track-record modelu + benchmark + backtest strategie z odehraných predikcí.
// **FREE** (agregátní/historické metriky nic konkrétního neprozrazují a budují
// důvěru – marketingový hák). PRO zůstává jen seznam nadcházejících tipů (/api/picks).
// `trackRecord` je globální (parametry ho nemění); `backtest` aplikuje navolené
// pravidlo na historii (úspěšnost „kdybys takhle sázel"). Čte jen z DB, nepočítá živě.
export async function GET(req: Request) {
  if (!allowRequest(`picks-stats:${clientKey(req)}`, 60, 60_000)) return tooMany();

  const sp = new URL(req.url).searchParams;
  const parsed = ruleSchema.safeParse({
    market: sp.get("market") ?? undefined,
    venue: sp.get("venue") ?? undefined,
    minProb: sp.get("minProb") ?? undefined,
    minEdge: sp.get("minEdge") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Neplatné pravidlo" }, { status: 400 });
  }

  try {
    const [allRows, allPublishedRows, clvByMarket] = await Promise.all([
      getSettledPredictionRows(),
      getPublishedPredictionRows(),
      isRealDataConfigured() ? marketClvSummaries() : Promise.resolve([]),
    ]);
    // Každá populační větev se měří samostatně. Reprezentace se nesmí přimíchat
    // do ligového track recordu jen proto, že nejsou evropským klubovým pohárem.
    const rows = allRows.filter((row) => row.modelContext === "LEAGUE");
    const europeanRows = allRows.filter((row) => isEuroCupLeague(row.leagueId));
    const nationalRows = allRows.filter((row) => row.modelContext === "NATIONAL");
    const publishedRows = allPublishedRows.filter((row) => row.modelContext === "LEAGUE");
    const europeanPublishedRows = allPublishedRows.filter((row) => isEuroCupLeague(row.leagueId));
    const nationalPublishedRows = allPublishedRows.filter((row) => row.modelContext === "NATIONAL");
    // Jen DB cache. Tato diagnostika nikdy nesmí spustit placený lazy fetch statistik.
    const actualCounts = isRealDataConfigured()
      ? await getCachedCountTotals(allRows)
      : new Map();
    // CLV navoleného pravidla: posunula se linie od našeho snímku k zavření směrem k nám?
    // Počítá se jen z řádků se DVĚMA snímky kurzu (od 26. 7. 2026), takže je zpočátku prázdné.
    const clvPicks = rows.flatMap((row) => {
      const m = evaluateRule(row, parsed.data);
      if (!m.ok) return [];
      const side = clvSideOf(parsed.data.market, m.side);
      return side ? [{ row, side }] : [];
    });
    return NextResponse.json(
      {
        trackRecord: computeTrackRecord(rows),
        publishedTips: computePublishedTipRecord(publishedRows),
        countAccuracy: computeCountModelAccuracy(rows, actualCounts),
        clvByMarket,
        benchmark: computeBenchmarkTrackRecord(rows),
        market: computeMarketBenchmark(rows),
        backtest: backtestRule(rows, parsed.data),
        reliability: computeReliability(rows),
        clv: summarizeClv(clvPicks),
        european: {
          experimental: true,
          promotionSample: 150,
          trackRecord: computeTrackRecord(europeanRows),
          publishedTips: computePublishedTipRecord(europeanPublishedRows),
          countAccuracy: computeCountModelAccuracy(europeanRows, actualCounts),
          benchmark: computeBenchmarkTrackRecord(europeanRows),
          market: computeMarketBenchmark(europeanRows),
          backtest: backtestRule(europeanRows, parsed.data),
          reliability: computeReliability(europeanRows),
          clv: summarizeClv(europeanRows.flatMap((row) => {
            const match = evaluateRule(row, parsed.data);
            if (!match.ok) return [];
            const side = clvSideOf(parsed.data.market, match.side);
            return side ? [{ row, side }] : [];
          })),
        },
        national: {
          trackRecord: computeTrackRecord(nationalRows),
          publishedTips: computePublishedTipRecord(nationalPublishedRows),
          countAccuracy: computeCountModelAccuracy(nationalRows, actualCounts),
          benchmark: computeBenchmarkTrackRecord(nationalRows),
          market: computeMarketBenchmark(nationalRows),
          reliability: computeReliability(nationalRows),
        },
      },
      // Odpověď **nezávisí na uživateli** (jen na pravidle v query) a vstupní data se
      // mění dvakrát denně se `settle-results`. Přitom to byl nejtěžší opakovaný dotaz
      // do Neonu v celé appce a jel bez jediné cache hlavičky – každé hnutí posuvníkem
      // znamenalo nové čtení všech vypořádaných řádků.
      { headers: publicCache(300, 900) }
    );
  } catch (e) {
    logError("api/picks/stats", e);
    return NextResponse.json({ error: "Chyba statistik" }, { status: 502 });
  }
}
