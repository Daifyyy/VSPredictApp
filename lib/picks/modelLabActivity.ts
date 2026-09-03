import { pragueTwoDayStart } from "@/lib/recentWindow";

export type ActivityCandidate = {
  kickoff: Date;
  hit: boolean | null;
  final?: boolean;
};

/**
 * Konkrétní řádky v Model Labu jsou záměrně krátké: budoucí/živé výběry a
 * vyhodnocené zápasy od začátku předchozího pražského dne. Dlouhodobé agregace
 * tento filtr nepoužívají.
 */
export function splitModelLabActivity<T extends ActivityCandidate>(rows: T[], now = new Date()) {
  const recentFrom = pragueTwoDayStart(now);
  const liveFrom = new Date(now.getTime() - 4 * 60 * 60_000);
  return {
    current: rows
      .filter((row) => row.hit == null && !row.final && row.kickoff >= liveFrom)
      .sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime()),
    recent: rows
      .filter((row) => row.hit != null && row.kickoff >= recentFrom)
      .sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime()),
  };
}
