import type {
  FormQuality,
  MetricValue,
  Team,
  TeamSummary,
  Venue,
} from "@/lib/types";
import { METRICS_BY_ENTITY } from "@/lib/types";
import { computeAllValues } from "@/lib/stats/aggregate";
import { computeAllSummaries } from "@/lib/stats/summary";
import { computeAllFormQuality } from "@/lib/stats/formQuality";
import {
  computeSingleTeamPlayStyle,
  type SingleTeamPlayStyleDimension,
} from "@/lib/stats/playStyle";

export interface TeamProfileCore {
  team: Pick<Team, "id" | "name" | "logoUrl" | "country" | "entityType" | "leagueId">;
  values: MetricValue[];
  summaries: TeamSummary[];
  formQuality: FormQuality[];
  styles: Record<Venue, SingleTeamPlayStyleDimension[]>;
}

export function buildTeamProfileCore(team: Team, now: Date = new Date()): TeamProfileCore {
  const matches = team.leagueMatches;
  const metrics = METRICS_BY_ENTITY[team.entityType];
  const values = computeAllValues(matches, metrics, team.entityType, now);
  return {
    team: {
      id: team.id,
      name: team.name,
      logoUrl: team.logoUrl,
      country: team.country,
      entityType: team.entityType,
      leagueId: team.leagueId,
    },
    values,
    summaries: computeAllSummaries(matches),
    formQuality: computeAllFormQuality(matches),
    styles: {
      TOTAL: computeSingleTeamPlayStyle(values, "TOTAL"),
      HOME: computeSingleTeamPlayStyle(values, "HOME"),
      AWAY: computeSingleTeamPlayStyle(values, "AWAY"),
    },
  };
}

export function describeTeamStyle(
  profile: TeamProfileCore,
  venue: Venue
): string[] {
  const styles = profile.styles[venue].filter((item) => item.available);
  if (styles.length === 0) return ["Pro hodnocení stylu zatím není dostatek dat."];
  const strongest = [...styles].sort((a, b) => b.score - a.score)[0];
  const weakest = [...styles].sort((a, b) => a.score - b.score)[0];
  const result = [
    `${strongest.label} patří k nejvýraznějším rysům týmu (${strongest.score.toFixed(1)}/10).`,
  ];
  if (weakest.key !== strongest.key) {
    result.push(`${weakest.label} je naopak méně výrazný prvek (${weakest.score.toFixed(1)}/10).`);
  }
  const quality = profile.formQuality.find((item) => item.venue === venue);
  if (quality?.note) result.push(quality.note);
  return result;
}
