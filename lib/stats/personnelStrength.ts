export type PersonnelProfile = {
  playerId: number;
  position: string | null;
  minutes: number | null;
  starts: number | null;
  appearances: number | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
};

const POSITION_PRIOR: Record<string, number> = { G: 6.72, D: 6.68, M: 6.72, F: 6.75 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function playerPersonnelValue(profile: PersonnelProfile | undefined, position?: string | null) {
  const prior = POSITION_PRIOR[(profile?.position ?? position ?? "").toUpperCase().slice(0, 1)] ?? 6.7;
  if (!profile) return { quality: prior, importance: 0.35, known: false };
  const appearances = Math.max(0, profile.appearances ?? 0);
  const reliability = clamp(appearances / 8, 0, 1);
  const rating = profile.rating == null ? prior : prior + (profile.rating - prior) * reliability;
  const minutesShare = clamp((profile.minutes ?? 0) / Math.max(1, appearances * 90), 0, 1);
  const startShare = clamp((profile.starts ?? 0) / Math.max(1, appearances), 0, 1);
  const contribution = clamp(((profile.goals ?? 0) + .7 * (profile.assists ?? 0)) / Math.max(4, appearances), 0, .7);
  const importance = clamp(.25 + .35 * minutesShare + .25 * startShare + .15 * contribution, .2, 1);
  return { quality: rating * (.9 + .1 * importance), importance, known: appearances > 0 };
}

export function weightedUnitStrength(players: Array<{ playerId: number | null; position: string | null }>, profiles: Map<number, PersonnelProfile>) {
  if (!players.length) return null;
  let weighted = 0, weights = 0, known = 0;
  for (const player of players) {
    const profile = player.playerId == null ? undefined : profiles.get(player.playerId);
    const value = playerPersonnelValue(profile, player.position);
    const weight = .5 + value.importance;
    weighted += value.quality * weight;
    weights += weight;
    if (value.known) known++;
  }
  return { value: weighted / weights, coverage: known / players.length };
}
