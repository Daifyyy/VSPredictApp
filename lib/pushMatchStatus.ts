import type { ApiFixture } from "@/lib/data/apiFootball";

const MINUTE = 60_000;
export const RESULT_WINDOW_START_MS = 35 * MINUTE;
export const RESULT_WINDOW_END_MS = 4 * 60 * MINUTE;
export const FIXTURE_BATCH_SIZE = 20;

export type MatchStatusEvent = {
  type: "HALFTIME" | "FINAL";
  title: string;
  body: string;
  tag: string;
};

type Score = { home: number; away: number };

function score(value: { home?: number | null; away?: number | null } | undefined): Score | null {
  return value?.home != null && value.away != null
    ? { home: value.home, away: value.away }
    : null;
}

const text = (value: Score): string => `${value.home}:${value.away}`;

export function isInResultNotificationWindow(kickoff: Date, now: Date): boolean {
  const elapsed = now.getTime() - kickoff.getTime();
  return elapsed >= RESULT_WINDOW_START_MS && elapsed <= RESULT_WINDOW_END_MS;
}

export function chunkFixtureIds(ids: number[]): number[][] {
  const unique = [...new Set(ids)];
  const chunks: number[][] = [];
  for (let index = 0; index < unique.length; index += FIXTURE_BATCH_SIZE) {
    chunks.push(unique.slice(index, index + FIXTURE_BATCH_SIZE));
  }
  return chunks;
}

export function matchStatusEvents(fixture: ApiFixture): MatchStatusEvent[] {
  const status = fixture.fixture.status.short;
  const elapsed = fixture.fixture.status.elapsed ?? null;
  const label = `${fixture.teams.home.name} – ${fixture.teams.away.name}`;
  const events: MatchStatusEvent[] = [];
  const halftime = score(fixture.score?.halftime);

  // Při opožděném 15min cronu lze bezpečný poločas poslat ještě na začátku druhé půle.
  if (halftime && (status === "HT" || (status === "2H" && elapsed != null && elapsed <= 60))) {
    events.push({
      type: "HALFTIME",
      title: `Poločas: ${label}`,
      body: `Stav ${text(halftime)}`,
      tag: `halftime-${fixture.fixture.id}`,
    });
  }

  if (!new Set(["FT", "AET", "PEN"]).has(status)) return events;
  const final = score(fixture.goals);
  if (!final) return events;

  let body = `Konečný stav ${text(final)}`;
  if (status === "AET") {
    const regular = score(fixture.score?.fulltime);
    body = regular
      ? `${text(regular)} po 90 minutách · ${text(final)} po prodloužení`
      : `${text(final)} po prodloužení`;
  } else if (status === "PEN") {
    const afterExtra = score(fixture.score?.extratime) ?? final;
    const penalties = score(fixture.score?.penalty);
    if (!penalties) return events;
    const advancing = penalties.home === penalties.away
      ? null
      : penalties.home > penalties.away
        ? fixture.teams.home.name
        : fixture.teams.away.name;
    body = `${text(afterExtra)} po 120 minutách · penalty ${text(penalties)}` +
      (advancing ? ` · postupuje ${advancing}` : "");
  }
  events.push({
    type: "FINAL",
    title: `Konec: ${label}`,
    body,
    tag: `final-${fixture.fixture.id}`,
  });
  return events;
}
