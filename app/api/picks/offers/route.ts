import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authUser";
import { getEntitlement } from "@/lib/entitlements";
import { getUpcomingPredictionRows } from "@/lib/data/predictionStore";
import {
  catalogLeagueName,
  competitionGroup,
  isPublicCompetition,
  publicCompetitionOrder,
} from "@/lib/data/catalog";
import { parseBooks, sharpFair, sharpFairTotal, sharpLineFair } from "@/lib/picks/books";
import { overProbNegBin } from "@/lib/picks/corners";
import { mainHalfLine } from "@/lib/picks/countDistribution";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";

function largestDifference(row: Awaited<ReturnType<typeof getUpcomingPredictionRows>>[number]) {
  const books = parseBooks(row.oddsBooks);
  const values: number[] = [];
  const one = sharpFair(books);
  if (one) values.push(row.homeWin - one.home, row.draw - one.draw, row.awayWin - one.away);
  const total = sharpFairTotal(books);
  if (total) values.push(row.over25 - total.over25, 1 - row.over25 - total.under25);
  for (const market of ["corners", "cards"] as const) {
    const line = mainHalfLine(books, market);
    const home = market === "corners" ? row.lambdaCornersHome : row.lambdaCardsHome;
    const away = market === "corners" ? row.lambdaCornersAway : row.lambdaCardsAway;
    if (line == null || home == null || away == null) continue;
    const fair = sharpLineFair(books, market, line);
    if (!fair) continue;
    const variance = (market === "corners" ? row.cornerVarianceRatio : row.cardVarianceRatio) ?? 1.2;
    const over = overProbNegBin(home + away, line, variance);
    values.push(over - fair.over, 1 - over - fair.under);
  }
  return values.length ? values.reduce((best, value) => Math.abs(value) > Math.abs(best) ? value : best, 0) : null;
}

export async function GET(req: Request) {
  if (!allowRequest(`pick-offers:${clientKey(req)}`, 60, 60_000)) return tooMany();
  const user = await getCurrentUser();
  if (!getEntitlement(user).pro) return NextResponse.json({ locked: true });
  try {
    const rows = await getUpcomingPredictionRows();
    const offers = rows.filter((row) => row.available && isPublicCompetition(row.leagueId)).map((row) => ({
      fixtureId: row.fixtureId,
      kickoff: row.kickoff,
      leagueId: row.leagueId,
      leagueName: catalogLeagueName(row.leagueId, `Soutěž ${row.leagueId}`),
      home: { id: row.homeTeamId, name: row.homeName, logoUrl: row.homeLogo },
      away: { id: row.awayTeamId, name: row.awayName, logoUrl: row.awayLogo },
      competitionGroup: competitionGroup(row.leagueId),
      competitionOrder: publicCompetitionOrder(row.leagueId),
      lowConfidence: row.lowConfidence,
      hasOdds: parseBooks(row.oddsBooks).length > 0,
      largestDifference: largestDifference(row),
      homeWin: row.homeWin,
      awayWin: row.awayWin,
      over25: row.over25,
      bttsYes: row.bttsYes,
      cardsOver35:
        row.lambdaCardsHome != null && row.lambdaCardsAway != null
          ? overProbNegBin(row.lambdaCardsHome + row.lambdaCardsAway, 3.5, row.cardVarianceRatio ?? 1.2)
          : null,
    }));
    return NextResponse.json({ offers });
  } catch (error) {
    logError("api/picks/offers", error);
    return NextResponse.json({ error: "Nabídku se nepodařilo načíst" }, { status: 502 });
  }
}
