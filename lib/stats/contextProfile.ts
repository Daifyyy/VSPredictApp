import type {
  FormQuality,
  LeagueTable,
  MatchPrediction,
  MatchResult,
  Standing,
  StandingSplit,
  TeamSummary,
  Venue,
} from "@/lib/types";

export type ContextBadgeTone = "positive" | "warning" | "info";

export interface ContextBadge {
  id:
    | "dark-horse"
    | "above-standing"
    | "in-form"
    | "performances-ahead"
    | "results-ahead"
    | "seeking-form"
    | "solid-defense";
  label: string;
  description: string;
  tone: ContextBadgeTone;
}

export interface ContextProfile {
  badges: ContextBadge[];
  formState: FormState;
  recent: {
    points: number;
    maximum: number;
    sampleSize: number;
    goalsFor: number | null;
    goalsAgainst: number | null;
  };
  xgDiffPerMatch: number | null;
  pointsPerGame: number | null;
}

export type FormStateTone = "positive" | "info" | "warning" | "negative" | "muted";

export interface FormState {
  score: number | null;
  label: "Výborná forma" | "Ve formě" | "Nevyrovnané období" | "Hledá formu" | "V krizi" | "Málo dat";
  tone: FormStateTone;
  reasons: string[];
  sampleSize: number;
}

interface ContextProfileInput {
  teamId: number;
  side: "home" | "away";
  venue: Venue;
  summary: TeamSummary | null;
  quality: FormQuality | null;
  standing: Standing | null;
  leagueTable: LeagueTable | null;
  prediction: MatchPrediction | null;
}

const pointsOf = (result: MatchResult): number =>
  result === "W" ? 3 : result === "D" ? 1 : 0;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Veřejné kvůli přesným testům hranic; skóre je popisný kontext, nikoli vstup predikce. */
export function buildFormState({
  points,
  maximum,
  sampleSize,
  xgDiffPerMatch,
  xgSampleSize,
  pointsPerGame,
}: {
  points: number;
  maximum: number;
  sampleSize: number;
  xgDiffPerMatch: number | null;
  xgSampleSize: number;
  pointsPerGame: number | null;
}): FormState {
  if (sampleSize < 3 || maximum <= 0) {
    return { score: null, label: "Málo dat", tone: "muted", reasons: [`${sampleSize} záp.`], sampleSize };
  }

  const components = [{ value: (points / maximum) * 10, weight: 0.5 }];
  if (xgDiffPerMatch != null && xgSampleSize >= 3) {
    components.push({ value: clamp(5 + xgDiffPerMatch * 2.5, 0, 10), weight: 0.3 });
  }
  if (pointsPerGame != null) {
    components.push({ value: clamp((pointsPerGame / 3) * 10, 0, 10), weight: 0.2 });
  }
  const weight = components.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round((components.reduce((sum, item) => sum + item.value * item.weight, 0) / weight) * 10) / 10;
  const classification = score >= 8
    ? { label: "Výborná forma" as const, tone: "positive" as const }
    : score >= 6.5
      ? { label: "Ve formě" as const, tone: "positive" as const }
      : score >= 4.5
        ? { label: "Nevyrovnané období" as const, tone: "info" as const }
        : score >= 3
          ? { label: "Hledá formu" as const, tone: "warning" as const }
          : { label: "V krizi" as const, tone: "negative" as const };
  const reasons = [`${points}/${maximum} bodů`];
  if (xgDiffPerMatch != null && xgSampleSize >= 3) {
    reasons.push(`xG ${xgDiffPerMatch > 0 ? "+" : ""}${xgDiffPerMatch.toFixed(2)}/záp.`);
  } else if (pointsPerGame != null) {
    reasons.push(`${pointsPerGame.toFixed(2)} b./záp.`);
  }
  return { score, ...classification, reasons: reasons.slice(0, 2), sampleSize };
}

function splitFor(standing: Standing | null, venue: Venue): StandingSplit | null {
  if (!standing) return null;
  if (venue === "HOME") return standing.home;
  if (venue === "AWAY") return standing.away;
  return standing.all;
}

function ppg(split: StandingSplit | null): number | null {
  if (!split || split.played === 0) return null;
  return (split.win * 3 + split.draw) / split.played;
}

function leadingUnbeaten(form: MatchResult[]): number {
  let length = 0;
  for (const result of form) {
    if (result === "L") break;
    length++;
  }
  return length;
}

function aboveStanding(
  teamId: number,
  table: LeagueTable | null
): boolean {
  if (!table) return false;
  const eligible = table.rows.filter((row) => row.all.played >= 5);
  const team = eligible.find((row) => row.teamId === teamId);
  if (!team || eligible.length < 3) return false;

  const topThird = Math.ceil(eligible.length / 3);
  if (team.rank <= Math.ceil(table.rows.length / 3)) return false;

  const byPpg = [...eligible].sort((a, b) => {
    const delta = (b.points / b.played) - (a.points / a.played);
    return delta || a.name.localeCompare(b.name, "cs");
  });
  const byGoalDiff = [...eligible].sort((a, b) => {
    const delta = (b.goalsDiff / b.played) - (a.goalsDiff / a.played);
    return delta || a.name.localeCompare(b.name, "cs");
  });
  return (
    byPpg.slice(0, topThird).some((row) => row.teamId === teamId) ||
    byGoalDiff.slice(0, topThird).some((row) => row.teamId === teamId)
  );
}

export function buildContextProfile(input: ContextProfileInput): ContextProfile {
  const form = input.summary?.form ?? [];
  const points = form.reduce((sum, result) => sum + pointsOf(result), 0);
  const qualityMatches = input.quality?.matches ?? [];
  const hasCompleteScore = qualityMatches.length === form.length && form.length > 0;
  const goalsFor = hasCompleteScore
    ? qualityMatches.reduce((sum, match) => sum + match.goalsFor, 0)
    : null;
  const goalsAgainst = hasCompleteScore
    ? qualityMatches.reduce((sum, match) => sum + match.goalsAgainst, 0)
    : null;
  const winProbability = input.prediction?.available
    ? input.side === "home"
      ? input.prediction.homeWin
      : input.prediction.awayWin
    : null;
  const badges: ContextBadge[] = [];

  if (
    winProbability != null &&
    winProbability <= 0.35 &&
    points >= 8 &&
    (input.quality?.xgDiffPerMatch ?? -Infinity) >= 0.25 &&
    (input.quality?.xgSampleSize ?? 0) >= 4
  ) {
    badges.push({
      id: "dark-horse",
      label: "Černý kůň zápasu",
      description: "Modelový outsider, jehož aktuální výsledky potvrzuje kladný xG trend.",
      tone: "info",
    });
  }

  if (aboveStanding(input.teamId, input.leagueTable)) {
    badges.push({
      id: "above-standing",
      label: "Nad tabulkovým postavením",
      description: "Tempo bodů nebo rozdílu skóre patří do horní třetiny ligy.",
      tone: "info",
    });
  }

  if (form.length >= 4 && points >= 9 && leadingUnbeaten(form) >= 3) {
    badges.push({
      id: "in-form",
      label: "Ve formě",
      description: "Nejméně 9 bodů z posledních pěti a série bez porážky.",
      tone: "positive",
    });
  }

  if (input.quality?.level === "underperforming") {
    badges.push({
      id: "performances-ahead",
      label: "Výkony nad výsledky",
      description: "Očekávané body z xG jsou lepší než skutečný bodový zisk.",
      tone: "positive",
    });
  } else if (input.quality?.level === "overperforming") {
    badges.push({
      id: "results-ahead",
      label: "Výsledky nad výkony",
      description: "Bodový zisk je vyšší, než odpovídá vytvořeným a povoleným šancím.",
      tone: "warning",
    });
  }

  if (form.length >= 4 && points <= 4) {
    badges.push({
      id: "seeking-form",
      label: "Hledá formu",
      description: "Nejvýše 4 body z posledních pěti utkání.",
      tone: "warning",
    });
  }

  if (
    (input.summary?.sampleSize ?? 0) >= 5 &&
    (input.summary?.cleanSheetPct ?? 0) >= 40
  ) {
    badges.push({
      id: "solid-defense",
      label: "Pevná obrana",
      description: "Čisté konto alespoň ve 40 % sledovaných zápasů.",
      tone: "positive",
    });
  }

  return {
    badges: badges.slice(0, 2),
    formState: buildFormState({
      points,
      maximum: form.length * 3,
      sampleSize: form.length,
      xgDiffPerMatch: input.quality?.xgDiffPerMatch ?? null,
      xgSampleSize: input.quality?.xgSampleSize ?? 0,
      pointsPerGame: ppg(splitFor(input.standing, input.venue)),
    }),
    recent: {
      points,
      maximum: form.length * 3,
      sampleSize: form.length,
      goalsFor,
      goalsAgainst,
    },
    xgDiffPerMatch: input.quality?.xgDiffPerMatch ?? null,
    pointsPerGame: ppg(splitFor(input.standing, input.venue)),
  };
}
