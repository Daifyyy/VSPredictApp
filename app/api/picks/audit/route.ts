import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { PUBLIC_CLUB_LEAGUE_IDS, EURO_LEAGUE_IDS } from "@/lib/data/catalog";
import { logError } from "@/lib/logError";

export const dynamic = "force-dynamic";
const FINISHED = ["FT", "AET", "PEN"];
type AuditModel = "1X2" | "OVER_25" | "BTTS" | "CORNERS" | "CARDS" | "FOULS";

export async function GET(req: Request) {
  if (!allowRequest(`picks-audit:${clientKey(req)}`, 30, 60_000)) return tooMany();
  const url = new URL(req.url);
  const model = (url.searchParams.get("model") ?? "1X2") as AuditModel;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const outcomeFilter = url.searchParams.get("result");
  const context = url.searchParams.get("context");
  const take = 30;
  try {
    const predictions = await prisma.fixturePrediction.findMany({
      where: {
        status: { in: FINISHED }, homeGoals: { not: null }, awayGoals: { not: null },
        ...(context === "EURO_CUP" ? { leagueId: { in: [...EURO_LEAGUE_IDS] } } : context === "LEAGUE" ? { leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS] } } : { leagueId: { in: [...PUBLIC_CLUB_LEAGUE_IDS, ...EURO_LEAGUE_IDS] } }),
      },
      orderBy: { kickoff: "desc" },
      take: 2000,
    });
    const countIds = model === "CORNERS" || model === "CARDS" || model === "FOULS" ? predictions.map((row) => row.fixtureId) : [];
    const stats = countIds.length ? await prisma.matchStatCache.findMany({ where: { fixtureId: { in: countIds } }, select: { fixtureId: true, teamId: true, corners: true, fouls: true, yellowCards: true, redCards: true } }) : [];
    const statsByFixture = new Map<number, typeof stats>();
    for (const row of stats) statsByFixture.set(row.fixtureId, [...(statsByFixture.get(row.fixtureId) ?? []), row]);
    const rows = predictions.flatMap((row) => {
      const home = row.homeGoals!, away = row.awayGoals!;
      let predicted = "", actual = "", hit: boolean | null = null, error: number | null = null;
      if (model === "1X2") { const pick = row.homeWin >= row.draw && row.homeWin >= row.awayWin ? "HOME" : row.awayWin >= row.draw ? "AWAY" : "DRAW"; const result = home > away ? "HOME" : away > home ? "AWAY" : "DRAW"; predicted = `${pick} · ${Math.max(row.homeWin, row.draw, row.awayWin).toFixed(3)}`; actual = result; hit = pick === result; }
      else if (model === "OVER_25") { predicted = `Over ${(row.over25 * 100).toFixed(1)} %`; actual = `${home + away} gólů`; hit = (row.over25 >= .5) === (home + away > 2.5); }
      else if (model === "BTTS") { predicted = `Ano ${(row.bttsYes * 100).toFixed(1)} %`; actual = home > 0 && away > 0 ? "Ano" : "Ne"; hit = (row.bttsYes >= .5) === (home > 0 && away > 0); }
      else {
        const unique = [...new Map((statsByFixture.get(row.fixtureId) ?? []).map((stat) => [stat.teamId, stat])).values()];
        const values = unique.map((stat) => model === "CORNERS" ? stat.corners : model === "FOULS" ? stat.fouls : stat.yellowCards == null && stat.redCards == null ? null : (stat.yellowCards ?? 0) + (stat.redCards ?? 0));
        const actualCount = values.some((value) => value != null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
        const expected = model === "CORNERS" ? row.lambdaCornersHome != null && row.lambdaCornersAway != null ? row.lambdaCornersHome + row.lambdaCornersAway : null : model === "CARDS" ? row.lambdaCardsHome != null && row.lambdaCardsAway != null ? row.lambdaCardsHome + row.lambdaCardsAway : null : row.lambdaFoulsHome != null && row.lambdaFoulsAway != null ? row.lambdaFoulsHome + row.lambdaFoulsAway : null;
        if (expected == null) return [];
        predicted = expected.toFixed(1); actual = actualCount?.toFixed(0) ?? "—"; error = actualCount == null ? null : Math.abs(expected - actualCount); hit = error == null ? null : error <= 1;
      }
      return [{ fixtureId: row.fixtureId, kickoff: row.kickoff.toISOString(), leagueId: row.leagueId, homeName: row.homeName, awayName: row.awayName, score: `${home}:${away}`, modelVersion: row.modelVersion, context: row.modelContext, lowConfidence: row.lowConfidence, predicted, actual, hit, error }];
    }).filter((row) => outcomeFilter !== "hit" ? outcomeFilter !== "miss" || row.hit === false : row.hit === true);
    const start = (page - 1) * take;
    return NextResponse.json({ cohortId: `${model}:${context ?? "ALL"}:${outcomeFilter ?? "ALL"}`, model, total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / take)), rows: rows.slice(start, start + take) });
  } catch (error) {
    logError("api/picks/audit", error);
    return NextResponse.json({ error: "Audit prognóz se nepodařilo načíst" }, { status: 502 });
  }
}
