import { NextResponse } from "next/server";
import { getLiveMatchReport } from "@/lib/data/repository";
import { allowRequest, clientKey, tooMany } from "@/lib/rateLimit";
import { logError } from "@/lib/logError";
import { getCurrentUser } from "@/lib/authUser";
import { liveMatchFlowEvaluation } from "@/lib/data/matchFlowStore";

/**
 * Přehled **probíhajícího** zápasu (kdo zatím určuje hru) pro rozbalený řádek v Programu.
 *
 * **FREE**: popisuje, co se už stalo, ne co se stane – stejně jako přehled dohraného
 * zápasu nic predikčního neprozrazuje.
 *
 * Rate-limit je **přísnější než u `/api/match-report`** (20 vs 30 za minutu), a to
 * vědomě: tam miss většinou trefí trvalou `MatchStatCache` a nic nestojí, tady je každý
 * miss upstream volání, které se navíc nedá sdílet mezi zápasy. Náklad dál stropuje TTL
 * v `getLiveMatchStatsPair` (120 s, o poločase 600 s) – ten platí napříč všemi klienty.
 *
 * CDN cache je krátká (30 s / 60 s stale) – vzorem `/api/fixtures/live`. Dlouhá cache
 * jako u dohraného zápasu by tu byla přímo škodlivá: panel by zamrzl na staré minutě.
 */
export async function GET(req: Request) {
  if (!allowRequest(`livereport:${clientKey(req)}`, 20, 60_000)) return tooMany();

  const p = new URL(req.url).searchParams;
  const fixtureId = Number(p.get("fixture"));
  const homeId = Number(p.get("home"));
  const awayId = Number(p.get("away"));
  if (!Number.isFinite(fixtureId) || !Number.isFinite(homeId) || !Number.isFinite(awayId)) {
    return NextResponse.json({ error: "Chybí zápas nebo týmy" }, { status: 400 });
  }

  const goalsHome = Number(p.get("gh"));
  const goalsAway = Number(p.get("ga"));
  const goals =
    Number.isFinite(goalsHome) && Number.isFinite(goalsAway)
      ? { home: goalsHome, away: goalsAway }
      : null;
  const elapsedRaw = Number(p.get("el"));
  const elapsed = Number.isFinite(elapsedRaw) ? elapsedRaw : null;
  const status = p.get("st") || "2H";
  const htHome = Number(p.get("hh"));
  const htAway = Number(p.get("ha"));
  const halftime =
    Number.isFinite(htHome) && Number.isFinite(htAway)
      ? { home: htHome, away: htAway }
      : null;

  try {
    const { report, reason, events } = await getLiveMatchReport({
      fixtureId,
      home: { id: homeId, name: p.get("hn") ?? "Domácí" },
      away: { id: awayId, name: p.get("an") ?? "Hosté" },
      goals,
      elapsed,
      status,
      halftime,
    });
    // `reason` cestuje na klienta schválně: „ještě je brzy" a „statistiky nedorazily"
    // vypadají v UI stejně (prázdno), ale znamenají něco jiného – a rozbité parsování
    // se pozná právě tím, že celý zápasový den hlásí `nostats`.
    const user = await getCurrentUser();
    const snapshot = report?.snapshot;
    const expectedVsActual = user?.tier === "PRO" && snapshot ? await liveMatchFlowEvaluation(fixtureId, {
      minute: snapshot.minute,
      status,
      home: { XG:snapshot.home.xg??undefined, SHOTS:snapshot.home.shots??undefined, SHOTS_ON_TARGET:snapshot.home.shotsOnTarget??undefined, SHOTS_INSIDE_BOX:snapshot.home.shotsInsideBox??undefined, CORNERS:snapshot.home.corners??undefined, POSSESSION:snapshot.home.possession??undefined },
      away: { XG:snapshot.away.xg??undefined, SHOTS:snapshot.away.shots??undefined, SHOTS_ON_TARGET:snapshot.away.shotsOnTarget??undefined, SHOTS_INSIDE_BOX:snapshot.away.shotsInsideBox??undefined, CORNERS:snapshot.away.corners??undefined, POSSESSION:snapshot.away.possession??undefined },
      goals: snapshot.goals,
      redCards: events.filter((event) => event.kind === "red").length,
      interrupted: ["INT", "SUSP"].includes(status),
    }) : null;
    return NextResponse.json(
      { report, reason, events, expectedVsActual },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    logError("api/live-report", e, { fixtureId });
    return NextResponse.json({ report: null, reason: "error", events: [] });
  }
}
