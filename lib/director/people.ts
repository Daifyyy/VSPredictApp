import { clamp } from "./random";

export const STAFF_ROLES = ["SCOUTING", "ANALYTICS", "ACADEMY", "FITNESS", "MEDICAL", "FINANCE", "COMMUNICATION"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function targetMinuteShare(role: string) {
  return role === "STARTER" ? .7 : role === "ROTATION" ? .38 : .16;
}

export function playerExpectation(input: {
  promisedRole: string;
  appearances: number;
  minutes: number;
  availableTeamMatches: number;
  injuryDays: number;
  currentStage: number;
  morale: number;
}) {
  const availableMatches = Math.max(0, input.availableTeamMatches - Math.ceil(input.injuryDays / 7));
  const availableMinutes = availableMatches * 90;
  const actualShare = availableMinutes > 0 ? clamp(input.minutes / availableMinutes, 0, 1) : 0;
  const target = targetMinuteShare(input.promisedRole);
  const gap = actualShare - target;
  const enoughEvidence = availableMatches >= 4;
  const unhappy = enoughEvidence && gap < -.12;
  const settled = !enoughEvidence || gap >= -.05;
  const nextStage = settled ? Math.max(0, input.currentStage - 1) : unhappy ? Math.min(5, input.currentStage + 1) : input.currentStage;
  const status = !enoughEvidence ? "LITTLE_DATA" : nextStage >= 4 ? "TRANSFER_REQUEST" : nextStage >= 3 ? "AGENT_MEETING" : nextStage >= 2 ? "COACH_TALK" : nextStage >= 1 ? "DOUBT" : "SETTLED";
  return {
    actualShare,
    target,
    gap,
    nextStage,
    status,
    moraleDelta: unhappy ? -Math.min(4, 1 + nextStage * .55) : settled && input.morale < 65 ? .5 : 0,
    reason: !enoughEvidence ? "Na spravedlivé vyhodnocení role zatím není dost dostupných utkání." : gap < 0 ? `Hráč dostává o ${Math.round(Math.abs(gap) * 100)} p. b. méně dostupných minut, než odpovídá slíbené roli.` : "Vytížení odpovídá dohodnuté roli.",
  };
}

export function coachEvaluation(input: {
  pointsPerMatch: number;
  expectedPointsPerMatch: number;
  squadUtilization: number;
  youthMinuteShare: number;
  morale: number;
  philosophyFit: number;
}) {
  const results = clamp(input.pointsPerMatch / 2.1 * 100);
  const performances = clamp(50 + (input.expectedPointsPerMatch - 1.35) * 38);
  const utilization = clamp(input.squadUtilization * 100);
  const youth = clamp(input.youthMinuteShare / .18 * 100);
  const dressingRoom = clamp(input.morale);
  const philosophy = clamp(input.philosophyFit);
  const overall = results * .28 + performances * .24 + utilization * .16 + youth * .1 + dressingRoom * .12 + philosophy * .1;
  return { results, performances, utilization, youth, dressingRoom, philosophy, overall };
}

export function informationQuality(staff: Array<{ role: string; ability: number; workload: number; status: string }>, role: StaffRole) {
  const candidates = staff.filter((item) => item.role === role && item.status === "ACTIVE");
  if (!candidates.length) return { quality: 20, uncertainty: "VERY_HIGH" as const, range: 20 };
  const quality = clamp(Math.max(...candidates.map((item) => item.ability * (1 - clamp(item.workload, 0, 100) / 250))), 15, 95);
  return { quality, uncertainty: quality >= 75 ? "LOW" as const : quality >= 55 ? "MEDIUM" as const : "HIGH" as const, range: Math.round(4 + (100 - quality) * .18) };
}

export function transferWindow(day: number, rules: unknown) {
  const source = rules && typeof rules === "object" ? rules as { transferWindows?: Array<{ start: number; end: number; name: string }> } : {};
  const windows = source.transferWindows ?? [];
  const current = windows.find((item) => day >= item.start && day <= item.end) ?? null;
  const next = windows.filter((item) => item.start > day).sort((a, b) => a.start - b.start)[0] ?? null;
  return { open: Boolean(current), current, next, registrationDay: current ? day : next?.start ?? null };
}

export function transferOfferUtility(input: {
  marketValue: number;
  upfront: number;
  installments: number;
  bonuses: number;
  sellOn: number;
  loanFee?: number;
  optionFee?: number | null;
  importance: number;
  sellerCashPressure: number;
  replacementDifficulty: number;
  rivalry: number;
  offeredWage: number;
  currentWage: number;
  offeredYears: number;
  targetYears: number;
  roleFit: number;
  clubAmbitionFit: number;
}) {
  const guaranteed = input.upfront + input.installments * .84 + (input.loanFee ?? 0) + (input.optionFee ?? 0) * .55;
  const contingent = input.bonuses * .32 + input.marketValue * input.sellOn / 100 * .2;
  const sportingCost = input.marketValue * (.12 * input.importance + .1 * input.replacementDifficulty + .08 * input.rivalry);
  const pressureRelief = input.marketValue * .12 * input.sellerCashPressure;
  const seller = (guaranteed + contingent + pressureRelief - sportingCost) / Math.max(1, input.marketValue);
  const wage = input.offeredWage / Math.max(1, input.currentWage * 1.12);
  const years = Math.min(1.1, input.offeredYears / Math.max(1, input.targetYears));
  const player = wage * .46 + years * .16 + input.roleFit * .22 + input.clubAmbitionFit * .16;
  const accepted = seller >= 1 && player >= .98;
  const reason = seller < .82 ? "Prodávající klub považuje garantovanou hodnotu za příliš nízkou vzhledem ke sportovní ztrátě."
    : input.replacementDifficulty > .75 && seller < 1 ? "Klub nemá připravenou náhradu a požaduje větší jistotu v okamžité platbě."
      : player < .88 ? "Agent nevidí dostatečný posun ve mzdě, roli a ambici nového klubu."
        : input.roleFit < .75 ? "Slíbená role neodpovídá hráčovu očekávání."
          : accepted ? "Struktura nabídky obstála sportovně, finančně i z pohledu hráče." : "Dohoda je blízko, ale protistrana má stále výhodnější alternativu.";
  return { seller, player, accepted, reason };
}

export function boardReview(input: { position: number; clubs: number; expectedPosition: number; expectedPoints: number; actualPoints: number; cash: number; liabilities: number; youthMinutes: number; academyTarget: number; completedProjects: number }) {
  const sporting = clamp(62 + (input.expectedPosition - input.position) * 7 + (input.actualPoints - input.expectedPoints) * 1.4);
  const finance = clamp(58 + (input.cash - input.liabilities) / 200_000);
  const academy = clamp(35 + input.youthMinutes / Math.max(1, input.academyTarget) * 45);
  const infrastructure = clamp(45 + input.completedProjects * 18);
  const overall = sporting * .5 + finance * .25 + academy * .15 + infrastructure * .1;
  return { sporting, finance, academy, infrastructure, overall, outcome: overall < 28 ? "DISMISSAL" : overall < 48 ? "WARNING" : overall >= 76 ? "EXCELLENT" : "CONTINUE" };
}
