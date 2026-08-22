import { clamp, hashSeed, seeded } from "./random";

export type StoryPhase = "SIGNAL" | "ESCALATION" | "DECISION" | "CONSEQUENCE" | "CLOSED";
export type StatementTone = "FACTUAL" | "DIPLOMATIC" | "AMBITIOUS" | "DEFENSIVE" | "EMOTIONAL" | "NO_COMMENT";

export const STORY_PHASES: StoryPhase[] = ["SIGNAL", "ESCALATION", "DECISION", "CONSEQUENCE", "CLOSED"];

export function nextStoryPhase(phase: StoryPhase): StoryPhase {
  return STORY_PHASES[Math.min(STORY_PHASES.length - 1, STORY_PHASES.indexOf(phase) + 1)];
}

export function supporterCouncil(segments: Array<{ kind: string; size: number; trust: number; conflict: number; identitySensitivity: number; priceSensitivity: number }>, issue: "IDENTITY" | "PRICE" | "SPORT") {
  const weighted = segments.reduce((sum, segment) => {
    const sensitivity = issue === "IDENTITY" ? segment.identitySensitivity : issue === "PRICE" ? segment.priceSensitivity : .55;
    return sum + (segment.trust - segment.conflict) * segment.size * sensitivity;
  }, 0);
  const weight = segments.reduce((sum, segment) => sum + segment.size * (issue === "IDENTITY" ? segment.identitySensitivity : issue === "PRICE" ? segment.priceSensitivity : .55), 0);
  const score = weight ? clamp(weighted / weight) : 50;
  return { score, stance: score >= 65 ? "SUPPORT" : score >= 45 ? "CONDITIONAL" : "OPPOSE" } as const;
}

export function statementImpact(tone: StatementTone, credibility: number, pressure: number) {
  const map: Record<StatementTone, { trust: number; reach: number; risk: number }> = {
    FACTUAL: { trust: 3, reach: 0, risk: 0 }, DIPLOMATIC: { trust: 2, reach: 1, risk: 0 },
    AMBITIOUS: { trust: 1, reach: 3, risk: 2 }, DEFENSIVE: { trust: -2, reach: 2, risk: 3 },
    EMOTIONAL: { trust: -1, reach: 5, risk: 4 }, NO_COMMENT: { trust: pressure > 65 ? -3 : 0, reach: -1, risk: 1 },
  };
  const base = map[tone];
  return { credibilityDelta: base.trust * (.65 + credibility / 200), reachMultiplier: clamp(1 + base.reach / 10, .8, 1.7), conflictRisk: clamp(base.risk * (.7 + pressure / 200), 0, 10) };
}

export function complianceExposure(input: { exposure: number; motivation: number; conflict: number; auditPressure: number; seed: number; traceId: string; day: number }) {
  const rand = seeded(hashSeed(input.seed, input.traceId, input.day, "compliance"));
  const score = input.exposure * .38 + input.motivation * .25 + input.conflict * .22 + input.auditPressure * .15;
  const threshold = 72 + rand() * 18;
  return { score, disclosed: score >= threshold, confidence: clamp(.45 + Math.abs(score - threshold) / 100, .45, .9) };
}

export interface ReputationInput { sporting: number; financial: number; people: number; negotiation: number; public: number; ethical: number }

export function reputationProfile(input: ReputationInput) {
  const values = Object.values(input);
  const overall = values.reduce((sum, value) => sum + value, 0) / values.length;
  const archetypes: string[] = [];
  if (input.sporting >= 68) archetypes.push("Sportovní architekt");
  if (input.financial >= 68) archetypes.push("Finanční stabilizátor");
  if (input.people >= 68) archetypes.push("Lídr lidí");
  if (input.negotiation >= 68) archetypes.push("Tvrdý vyjednavač");
  if (input.public >= 68) archetypes.push("Důvěryhodná tvář");
  if (input.ethical < 42) archetypes.push("Ředitel pod tlakem");
  if (!archetypes.length) archetypes.push("Datový pragmatik");
  return { overall: clamp(overall), archetypes: archetypes.slice(0, 3) };
}

export function storyCooldownKey(pack: string, actors: string[]) {
  return `${pack}:${[...actors].sort().join("|")}`;
}

export function contentDiagnostics(items: Array<{ key: string; pack: string; headline: string; openedDay: number }>) {
  const duplicateHeadlines = items.length - new Set(items.map((item) => item.headline.trim().toLocaleLowerCase("cs"))).size;
  const keyCounts = new Map<string, number>(); const packCounts = new Map<string, number>();
  for (const item of items) { keyCounts.set(item.key, (keyCounts.get(item.key) ?? 0) + 1); packCounts.set(item.pack, (packCounts.get(item.pack) ?? 0) + 1); }
  const repeatedKeys = [...keyCounts.entries()].filter(([, count]) => count > 2).map(([key]) => key);
  const dominantPack = [...packCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { duplicateHeadlines, repeatedKeys, dominantPack: dominantPack && dominantPack[1] / Math.max(1, items.length) > .45 ? dominantPack[0] : null };
}
