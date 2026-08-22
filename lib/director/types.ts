export const DIRECTOR_WORLD_VERSION = 2;
export const MAX_BANKED_STEPS = 3;

export type DirectorSection = "office" | "team" | "market" | "club" | "competitions";
export type EventSeverity = "INFO" | "DECISION" | "CRISIS";
export type AchievementRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" | "SECRET";

export interface DirectorChoice {
  key: string;
  label: string;
  detail: string;
  effects: {
    boardTrust?: number;
    publicTrust?: number;
    mediaCredibility?: number;
    fanTrust?: number;
    cash?: number;
    coachRelationship?: number;
  };
}

export interface DirectorDTO {
  career: {
    id: string;
    name: string;
    version: number;
    gameDate: string;
    dayIndex: number;
    availableSteps: number;
    reputation: number;
    boardTrust: number;
    publicTrust: number;
    mediaCredibility: number;
    ethicsMode: string;
    identityTags: string[];
  };
  club: {
    id: string;
    name: string;
    shortName: string;
    logo: string | null;
    primaryColor: string;
    leagueName: string;
    cashBalance: number;
    transferBudget: number;
    wageBudget: number;
    weeklyWages: number;
    fanTrust: number;
    morale: number;
    cohesion: number;
    form: number;
    stadium: {
      name: string;
      capacity: number;
      attendance: number;
      condition: number;
      atmosphere: number;
      commercial: number;
    };
    facilities: { academy: number; training: number; medical: number; scouting: number };
  };
  coach: {
    id: string;
    name: string;
    philosophy: string;
    formation: string;
    adaptability: number;
    youthDevelopment: number;
    manManagement: number;
    matchManagement: number;
    relationship: number;
    transferAuthority: string;
    transferVeto: boolean;
    contractUntil: string;
    weeklyWage: number;
  } | null;
  players: Array<{
    id: string;
    name: string;
    position: string;
    archetype: string;
    personality: string;
    age: number;
    ability: number;
    potential: number;
    form: number;
    fitness: number;
    morale: number;
    injuryDays: number;
    contractUntil: string;
    weeklyWage: number;
    marketValue: number;
    promisedRole: string;
  }>;
  events: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    body: string;
    reason: string;
    stakes: string;
    dueDay: number | null;
    choices: DirectorChoice[];
  }>;
  pulse: Array<{
    id: string;
    authorType: string;
    authorName: string;
    tone: string;
    body: string;
    topic: string;
    trust: number;
    reach: number;
    dayIndex: number;
  }>;
  achievements: Array<{
    id: string;
    key: string;
    title: string;
    description: string;
    rarity: AchievementRarity;
    unlockedAt: string;
    seen: boolean;
  }>;
  matches: Array<{
    id: string;
    round: number;
    scheduledDay: number;
    status: string;
    homeName: string;
    awayName: string;
    homeLogo: string | null;
    awayLogo: string | null;
    homeGoals: number | null;
    awayGoals: number | null;
    homeXg: number | null;
    awayXg: number | null;
    timeline: Array<{ minute: number; type: string; text: string }>;
    coachReport: { headline?: string; summary?: string };
  }>;
  marketTargets: Array<{ id: string; name: string; club: string; position: string; archetype: string; age: number; estimateMin: number; estimateMax: number; abilityMin: number; abilityMax: number }>;
  negotiations: Array<{ id: string; playerId: string; playerName: string; clubName: string; status: string; round: number; patience: number; referenceValue: number; response: string | null }>;
  projects: Array<{ id: string; kind: string; title: string; status: string; startedDay: number; finishDay: number; cost: number }>;
  influences: Array<{ id: string; sourceLabel: string; metric: string; direction: string; strength: string; confidence: string; explanation: string; startDay: number; endDay: number | null }>;
  commitments: Array<{ id: string; stakeholderType: string; title: string; status: string; dueDay: number; progress: number | null; explanation: string }>;
  relationships: Array<{ id: string; actorType: string; actorName: string; trust: number; respect: number; alignment: number; conflicts: number; summary: string }>;
  changes: Array<{ id: string; dayIndex: number; category: string; headline: string; explanation: string; importance: number; sourceType: string; sourceId: string | null }>;
  finances: { receivables: number; liabilities: number; recent: Array<{ id: string; dayIndex: number; category: string; direction: string; amount: number; status: string; description: string }> };
  season: { number: number; currentRound: number; status: string; table: Array<{ position: number; clubId: string; clubName: string; logo: string | null; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; points: number; expectedPoints: number; performance: number; isManaged: boolean }> } | null;
  legacyArchiveAvailable: boolean;
}
