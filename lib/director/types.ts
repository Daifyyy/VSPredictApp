export const DIRECTOR_WORLD_VERSION = 7;
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
    personality: string;
    reputation: number;
    ambition: number;
    mandate: Record<string, unknown>;
    evaluation: { overall: number; results: number; performances: number; utilization: number; youth: number; dressingRoom: number; philosophy: number };
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
    transferStatus: string;
    tacticalRoles: Array<{ role: string; fit: number }>;
    load: { acute: number; chronic: number; readiness: number; healthRisk: number; healthStatus: string; minutesLimit: number | null; recurrenceRisk: number };
    expectation: { expectedRole: string; targetMinuteShare: number; actualMinuteShare: number; status: string; escalationStage: number; willingness: number; reason: string | null } | null;
    agent: { name: string; personality: string } | null;
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
    engineVersion?: number;
    phaseStats?: Record<string, unknown>;
    plan?: { formation: string; mentality: string; confidence: number; familiarity: number; predictability: number; cohesionCost: number; uncertainty: string[]; lineup: Array<{ playerId: string; role: string; roleFit: number; reason: string }>; reasons: string[]; weaknesses: string[] } | null;
  }>;
  sporting?: {
    policy: { desiredStyle: string; youthPreference: number; rotationLevel: number; trainingIntensity: number; healthRiskTolerance: number; phasePriorities: Record<string, number> } | null;
    meetings: Array<{ id: string; title: string; briefing: string; trigger: string; status: string; dueDay: number | null; recommendation: Record<string, unknown>; resolution: string | null }>;
    memory: { phases: Record<string, number>; familiarity: number; predictability: number; confidence: number; sampleSize: number } | null;
    microcycle: { kind: string; intensity: number; focus: string; congestion: number; explanation: string } | null;
    medicalAlerts: Array<{ playerId: string; playerName: string; status: string; readiness: number; recurrenceRisk: number; minutesLimit: number | null; returnWindow: string | null; explanation: string }>;
    opponentAnalysis: { opponentName: string; sampleSize: number; predictability: number; uncertainty: number; keyDuels: string[]; explanation: string[] } | null;
  };
  marketTargets: Array<{ id: string; name: string; club: string; country: string | null; competition: string | null; position: string; archetype: string; age: number; estimateMin: number; estimateMax: number; abilityMin: number; abilityMax: number; potentialMin: number; potentialMax: number; wageMin: number; wageMax: number; tacticalFit: number; completeness: number; shortlisted: boolean }>;
  negotiations: Array<{ id: string; playerId: string; playerName: string; clubName: string; status: string; round: number; patience: number; referenceValue: number; response: string | null }>;
  people: {
    transferWindow: { open: boolean; name: string | null; nextDay: number | null };
    staff: Array<{ id: string; role: string; name: string; ability: number; workload: number; weeklyWage: number; relationship: number; status: string; uncertainty: string }>;
    staffCandidates: Array<{ id: string; role: string; name: string; ability: number; weeklyWage: number; personality: string }>;
    squadGroups: Array<{ id: string; kind: string; name: string; influence: number; members: string[] }>;
    transferCases: Array<{ id: string; playerId: string; playerName: string; sellingClub: string; buyingClub: string; kind: string; status: string; stage: string; initiatedBy: string; deadlineDay: number | null; registrationDay: number | null; response: string | null; round: number; competingBids: number; failureReason: string | null }>;
    contractTalks: Array<{ id: string; caseId: string; playerName: string; status: string; round: number; patience: number; deadlineDay: number; response: string | null }>;
    objectives: Array<{ id: string; kind: string; target: number; progress: number | null; status: string; explanation: string }>;
    reviews: Array<{ id: string; kind: string; overall: number; outcome: string; dayIndex: number; explanation: string[] }>;
    coachCandidates: Array<{ id: string; name: string; philosophy: string; reputation: number; ambition: number; wageDemand: number; status: string }>;
    coachNegotiations: Array<{ id: string; candidateName: string; status: string; round: number; patience: number; response: string | null }>;
    jobOffers: Array<{ id: string; clubName: string; status: string; expiresDay: number }>;
  };
  projects: Array<{ id: string; kind: string; title: string; status: string; startedDay: number; finishDay: number; cost: number }>;
  influences: Array<{ id: string; sourceLabel: string; metric: string; direction: string; strength: string; confidence: string; explanation: string; startDay: number; endDay: number | null }>;
  commitments: Array<{ id: string; stakeholderType: string; title: string; status: string; dueDay: number; progress: number | null; explanation: string }>;
  relationships: Array<{ id: string; actorType: string; actorName: string; trust: number; respect: number; alignment: number; conflicts: number; summary: string }>;
  changes: Array<{ id: string; dayIndex: number; category: string; headline: string; explanation: string; importance: number; sourceType: string; sourceId: string | null }>;
  finances: { receivables: number; liabilities: number; recent: Array<{ id: string; dayIndex: number; category: string; direction: string; amount: number; status: string; description: string }> };
  market: { needs: Array<{ id: string; position: string; role: string | null; urgency: number; reason: string; budgetMin: number | null; budgetMax: number | null; tacticalFit: number | null }>; shortlist: Array<{ playerId: string; playerName: string; priority: number; status: string; note: string | null; alert: string | null }>; payments: Array<{ id: string; kind: string; amount: number; dueDay: number | null; status: string; direction: string }>; clauses: Array<{ id: string; playerId: string; kind: string; value: number; status: string }>; reservedCash: number; worstProjectedCash: number };
  infrastructure?: { zones: Array<{ id: string; kind: string; name: string; level: number; capacity: number; condition: number; quality: number; operatingCost: number; revenuePotential: number; temporaryCapacity: number | null }>; projects: Array<{ id: string; kind: string; title: string; phase: string; status: string; targetDay: number | null; costMin: number; costMax: number; approvedCost: number | null; spent: number; contingency: number; temporaryCapacity: number | null; approvals: Array<{ stakeholder: string; status: string; explanation: string | null }>; financing: Array<{ source: string; amount: number; remaining: number; interestRate: number; status: string }> }>; supporters: Array<{ kind: string; size: number; trust: number; conflict: number; preference: string }>; ticketPolicy: { standardPrice: number; familyPrice: number; premiumPrice: number; seasonTicket: number } | null; academy: { teamId: string; coachingQuality: number; players: Array<{ id: string; name: string; age: number; position: string; ability: number; potential: number; readiness: number; pathway: string; focus: string; minutes: number }>; recentMatches: Array<{ id: string; round: number; opponent: string; status: string; goalsFor: number | null; goalsAgainst: number | null; performance: number | null }> } | null; identity: { declared: string[]; observed: Record<string, number>; alignment: number; credibility: number; drivers: string[] } | null; sponsorOffers: Array<{ id: string; sponsor: string; category: string; guaranteed: number; bonus: number; durationDays: number; namingRights: boolean; expiresDay: number; ethics: number }>; sponsorContracts: Array<{ id: string; sponsor: string; category: string; guaranteed: number; bonus: number; endDay: number; namingRights: boolean; status: string }> };
  season: { number: number; currentRound: number; status: string; table: Array<{ position: number; clubId: string; clubName: string; logo: string | null; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; points: number; expectedPoints: number; performance: number; isManaged: boolean }> } | null;
  legacyArchiveAvailable: boolean;
}
