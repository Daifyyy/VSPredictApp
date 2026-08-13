import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { getFixturePredictionRow } from "@/lib/data/repository";
import { isEuroCupLeague } from "@/lib/data/catalog";
import type { FixtureModelForecast } from "@/lib/types";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { parseBooks } from "@/lib/picks/books";
import { buildCountForecast } from "@/lib/picks/countDistribution";

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
  if (!entitlement.pro) return NextResponse.json({ locked: true });
  try {
    const row = await getFixturePredictionRow(fixtureId);
    if (!row || !row.available) return NextResponse.json({ forecast: null });
    const books = parseBooks(row.oddsBooks);
    const countOptions = {
      books,
      lowConfidence: row.lowConfidence,
      readinessSample: row.readinessSample,
    };
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
      }),
      cards: buildCountForecast(row.lambdaCardsHome, row.lambdaCardsAway, {
        ...countOptions,
        market: "cards",
      }),
    };
    return NextResponse.json({ forecast });
  } catch (error) {
    logError("api/predictions/fixture", error, { fixtureId });
    return NextResponse.json({ error: "Predikci se nepodařilo načíst" }, { status: 502 });
  }
}
