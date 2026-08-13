import { describe, expect, it } from "vitest";
import { deriveLiveMomentum } from "./liveMomentum";
import type { LiveSnapshot } from "./liveReport";

const snapshot = (minute: number, home: Partial<LiveSnapshot["home"]> = {}, away: Partial<LiveSnapshot["away"]> = {}): LiveSnapshot => ({
  minute,
  home: { xg: 0, shots: 0, shotsOnTarget: 0, corners: 0, ...home },
  away: { xg: 0, shots: 0, shotsOnTarget: 0, corners: 0, ...away },
  goals: { home: 0, away: 0 },
});

const teams = { home: "Sparta", away: "Lyon" };

describe("deriveLiveMomentum", () => {
  it("čeká na dva snímky", () => {
    expect(deriveLiveMomentum(null, snapshot(30), teams)).toBeNull();
  });

  it("popíše konkrétní tlak v posledním úseku", () => {
    const value = deriveLiveMomentum(
      snapshot(30, { xg: 0.2, shots: 2 }),
      snapshot(38, { xg: 0.65, shots: 5, shotsOnTarget: 2, corners: 1 }),
      teams
    );
    expect(value?.side).toBe("home");
    expect(value?.headline).toContain("Sparta");
    expect(value?.details.join(" ")).toContain("střely 3 : 0");
  });

  it("rozpozná změnu skóre", () => {
    const before = snapshot(50);
    const after = snapshot(56);
    after.goals = { home: 0, away: 1 };
    expect(deriveLiveMomentum(before, after, teams)?.headline).toContain("Lyon");
  });

  it("neporovnává příliš vzdálené snímky", () => {
    expect(deriveLiveMomentum(snapshot(20), snapshot(45), teams)).toBeNull();
  });
});
