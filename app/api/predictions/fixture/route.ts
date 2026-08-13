import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement, isAdminEmail } from "@/lib/entitlements";
import { getFixturePredictionRow } from "@/lib/data/repository";
import { isEuroCupLeague } from "@/lib/data/catalog";
import type { FixtureModelForecast } from "@/lib/types";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { parseBooks } from "@/lib/picks/books";
import { buildCountForecast } from "@/lib/picks/countDistribution";
import { getSettledPredictionRows } from "@/lib/data/repository";
import { getCachedCountTotals } from "@/lib/data/cache";
import { unstable_cache } from "next/cache";
import { isRealDataConfigured } from "@/lib/db";
import { getRefereeProfile } from "@/lib/data/refereeStore";

const countSamples = unstable_cache(async () => {
  if (!isRealDataConfigured()) return {};
  const rows = await getSettledPredictionRows();
  const actual = await getCachedCountTotals(rows);
  const out = new Map<string, number>();
  for (const row of rows) {
    const context = row.modelContext ?? "LEAGUE";
    const counts = actual.get(row.fixtureId);
    for (const market of ["corners", "cards"] as const) {
      const home = market === "corners" ? row.lambdaCornersHome : row.lambdaCardsHome;
      const away = market === "corners" ? row.lambdaCornersAway : row.lambdaCardsAway;
      if (home == null || away == null || counts?.[market] == null) continue;
      const version = row.countModelVersion ?? 0;
      const varianceRatio =
        (market === "corners" ? row.cornerVarianceRatio : row.cardVarianceRatio) ?? 1.2;
      const key = `${context}:${market}:${version}:${varianceRatio}`;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return Object.fromEntries(out);
}, ["count-model-samples"], { revalidate: 300 });

export async function GET(req: Request) {
  if (!allowRequest(`fixture-model:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const fixtureId = Number(new URL(req.url).searchParams.get("fixture"));
  if (!Number.isFinite(fixtureId)) {
    return NextResponse.json({ error: "Chybí zápas" }, { status: 400 });
  }
  const user = await getCurrentUser();
  const entitlement = getEntitlement(
    user ? { tier: user.tier, proTrialUsed: user.proTrialUsed } : null
  );
  if (!entitlement.pro && !isAdminEmail(user?.email)) return NextResponse.json({ locked: true });
  try {
    const row = await getFixturePredictionRow(fixtureId);
    if (!row || !row.available) return NextResponse.json({ forecast: null });
    const books = parseBooks(row.oddsBooks);
    const samples = await countSamples();
    const context = row.modelContext ?? "LEAGUE";
    const version = row.countModelVersion ?? 0;
    const countOptions = {
      books,
      evaluatedSample: 0,
    };
    const refereeProfile = row.refereeName
      ? await getRefereeProfile(row.refereeName, row.leagueId, new Date(row.kickoff), context)
      : null;
    if (refereeProfile) {
      refereeProfile.factor = row.refereeFactor ?? refereeProfile.factor;
      refereeProfile.sample = row.refereeSample ?? refereeProfile.sample;
      refereeProfile.lambdaBefore =
        row.lambdaCardsHomeBeforeRef != null && row.lambdaCardsAwayBeforeRef != null
          ? row.lambdaCardsHomeBeforeRef + row.lambdaCardsAwayBeforeRef
          : null;
      refereeProfile.lambdaAfter =
        row.lambdaCardsHome != null && row.lambdaCardsAway != null
          ? row.lambdaCardsHome + row.lambdaCardsAway
          : null;
    }
    const forecast: FixtureModelForecast = {
      fixtureId,
      experimental: isEuroCupLeague(row.leagueId),
      lowConfidence: row.lowConfidence,
      readinessSample: row.readinessSample,
      outcome: { home: row.homeWin, draw: row.draw, away: row.awayWin },
      goals: {
        home: row.lambdaHome,
        away: row.lambdaAway,
        over25: row.over25,
        btts: row.bttsYes,
      },
      corners: buildCountForecast(row.lambdaCornersHome, row.lambdaCornersAway, {
        ...countOptions,
        market: "corners",
        varianceRatio: row.cornerVarianceRatio,
        version,
        evaluatedSample: samples[`${context}:corners:${version}:${row.cornerVarianceRatio ?? 1.2}`] ?? 0,
      }),
      cards: buildCountForecast(row.lambdaCardsHome, row.lambdaCardsAway, {
        ...countOptions,
        market: "cards",
        varianceRatio: row.cardVarianceRatio,
        version,
        evaluatedSample: samples[`${context}:cards:${version}:${row.cardVarianceRatio ?? 1.2}`] ?? 0,
      }),
      refereeProfile,
    };
    return NextResponse.json({ forecast });
  } catch (error) {
    logError("api/predictions/fixture", error, { fixtureId });
    return NextResponse.json({ error: "Predikci se nepodařilo načíst" }, { status: 502 });
  }
}
