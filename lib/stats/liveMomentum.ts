import type { LiveSnapshot, LiveSnapshotSide } from "./liveReport";
import type { MatchTeams } from "./matchReport";

export interface LiveMomentum {
  side: "home" | "away" | "even";
  minutes: number;
  headline: string;
  details: string[];
}

const delta = (next: number | null, previous: number | null): number | null =>
  next == null || previous == null ? null : Math.max(0, next - previous);

function changes(next: LiveSnapshotSide, previous: LiveSnapshotSide) {
  return {
    xg: delta(next.xg, previous.xg),
    shots: delta(next.shots, previous.shots),
    shotsOnTarget: delta(next.shotsOnTarget, previous.shotsOnTarget),
    corners: delta(next.corners, previous.corners),
  };
}

function pressure(value: ReturnType<typeof changes>): number {
  return (value.xg ?? 0) * 4 + (value.shotsOnTarget ?? 0) * 1.5 +
    (value.shots ?? 0) * 0.4 + (value.corners ?? 0) * 0.3;
}

function detail(home: ReturnType<typeof changes>, away: ReturnType<typeof changes>): string[] {
  const out: string[] = [];
  if (home.xg != null && away.xg != null && home.xg + away.xg > 0) {
    out.push(`nové xG ${home.xg.toFixed(2)} : ${away.xg.toFixed(2)}`);
  }
  if (home.shots != null && away.shots != null && home.shots + away.shots > 0) {
    out.push(`střely ${home.shots} : ${away.shots}`);
  }
  if (home.shotsOnTarget != null && away.shotsOnTarget != null && home.shotsOnTarget + away.shotsOnTarget > 0) {
    out.push(`na branku ${home.shotsOnTarget} : ${away.shotsOnTarget}`);
  }
  if (home.corners != null && away.corners != null && home.corners + away.corners > 0) {
    out.push(`rohy ${home.corners} : ${away.corners}`);
  }
  return out.slice(0, 3);
}

/** Porovná dva kumulativní snímky; žádná další data ani API volání nejsou potřeba. */
export function deriveLiveMomentum(
  previous: LiveSnapshot | null | undefined,
  current: LiveSnapshot | null | undefined,
  teams: MatchTeams
): LiveMomentum | null {
  if (!previous || !current) return null;
  const minutes = current.minute - previous.minute;
  if (minutes <= 0 || minutes > 20) return null;

  const home = changes(current.home, previous.home);
  const away = changes(current.away, previous.away);
  const details = detail(home, away);
  const homeGoals = current.goals && previous.goals ? current.goals.home - previous.goals.home : 0;
  const awayGoals = current.goals && previous.goals ? current.goals.away - previous.goals.away : 0;

  if (homeGoals > 0 || awayGoals > 0) {
    const scorer = homeGoals > awayGoals ? teams.home : awayGoals > homeGoals ? teams.away : null;
    return {
      side: scorer === teams.home ? "home" : scorer === teams.away ? "away" : "even",
      minutes,
      headline: scorer ? `${scorer} v posledním úseku skóroval.` : "V posledním úseku skórovaly oba týmy.",
      details,
    };
  }

  const hp = pressure(home);
  const ap = pressure(away);
  const side = hp > ap * 1.45 && hp >= 1 ? "home" : ap > hp * 1.45 && ap >= 1 ? "away" : "even";
  const headline = side === "home"
    ? `${teams.home} měl v posledních ${minutes} minutách větší tlak.`
    : side === "away"
      ? `${teams.away} měl v posledních ${minutes} minutách větší tlak.`
      : details.length > 0
        ? `Posledních ${minutes} minut bylo bez výrazné převahy.`
        : `Za posledních ${minutes} minut nepřibyla významná útočná akce.`;
  return { side, minutes, headline, details };
}
