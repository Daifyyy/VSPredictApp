-- Manažer v2: relační svět klubového a sportovního ředitele.
-- Starý "GameSave" se záměrně nemaže ani nemění; slouží jako archiv kariér v1.

CREATE TABLE "DirectorCareer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "leagueId" INTEGER NOT NULL,
    "leagueName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "managedClubId" TEXT,
    "worldSeed" INTEGER NOT NULL,
    "gameDate" TIMESTAMP(3) NOT NULL,
    "dayIndex" INTEGER NOT NULL DEFAULT 0,
    "availableSteps" INTEGER NOT NULL DEFAULT 1,
    "lastStepGrantAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reputation" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "boardTrust" DOUBLE PRECISION NOT NULL DEFAULT 65,
    "publicTrust" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "mediaCredibility" DOUBLE PRECISION NOT NULL DEFAULT 55,
    "ethicsMode" TEXT NOT NULL DEFAULT 'REALISTIC',
    "publicProfile" BOOLEAN NOT NULL DEFAULT false,
    "identityTags" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectorCareer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorClub" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "externalTeamId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "logo" TEXT,
    "primaryColor" TEXT NOT NULL,
    "isManaged" BOOLEAN NOT NULL DEFAULT false,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "baseAttack" DOUBLE PRECISION NOT NULL,
    "baseDefense" DOUBLE PRECISION NOT NULL,
    "currentForm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cohesion" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "morale" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "cashBalance" INTEGER NOT NULL,
    "transferBudget" INTEGER NOT NULL,
    "wageBudget" INTEGER NOT NULL,
    "weeklyWages" INTEGER NOT NULL DEFAULT 0,
    "fanTrust" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "boardExpectation" TEXT NOT NULL DEFAULT 'STABILITY',
    "stadiumName" TEXT NOT NULL,
    "stadiumCapacity" INTEGER NOT NULL,
    "stadiumAttendance" DOUBLE PRECISION NOT NULL DEFAULT 0.72,
    "stadiumCondition" DOUBLE PRECISION NOT NULL DEFAULT 65,
    "stadiumAtmosphere" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "stadiumCommercial" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "academyLevel" INTEGER NOT NULL DEFAULT 2,
    "trainingLevel" INTEGER NOT NULL DEFAULT 2,
    "medicalLevel" INTEGER NOT NULL DEFAULT 2,
    "scoutingLevel" INTEGER NOT NULL DEFAULT 2,
    "infrastructure" JSONB NOT NULL DEFAULT '{}',
    "financeHistory" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectorClub_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorPlayer" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "preferredFoot" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "ability" DOUBLE PRECISION NOT NULL,
    "potential" DOUBLE PRECISION NOT NULL,
    "ballSkill" DOUBLE PRECISION NOT NULL,
    "creation" DOUBLE PRECISION NOT NULL,
    "finishing" DOUBLE PRECISION NOT NULL,
    "defending" DOUBLE PRECISION NOT NULL,
    "physical" DOUBLE PRECISION NOT NULL,
    "mentality" DOUBLE PRECISION NOT NULL,
    "form" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "fitness" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "morale" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "cohesion" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "injuryDays" INTEGER NOT NULL DEFAULT 0,
    "contractUntil" TIMESTAMP(3) NOT NULL,
    "weeklyWage" INTEGER NOT NULL,
    "marketValue" INTEGER NOT NULL,
    "promisedRole" TEXT NOT NULL DEFAULT 'SQUAD',
    "appearances" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "scoutMin" DOUBLE PRECISION,
    "scoutMax" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectorPlayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorCoach" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "philosophy" TEXT NOT NULL,
    "formation" TEXT NOT NULL,
    "adaptability" DOUBLE PRECISION NOT NULL,
    "youthDevelopment" DOUBLE PRECISION NOT NULL,
    "manManagement" DOUBLE PRECISION NOT NULL,
    "matchManagement" DOUBLE PRECISION NOT NULL,
    "relationship" DOUBLE PRECISION NOT NULL DEFAULT 65,
    "transferAuthority" TEXT NOT NULL DEFAULT 'CONSULT',
    "transferVeto" BOOLEAN NOT NULL DEFAULT false,
    "contractUntil" TIMESTAMP(3) NOT NULL,
    "weeklyWage" INTEGER NOT NULL,
    "severanceMonths" INTEGER NOT NULL DEFAULT 6,
    "promises" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectorCoach_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorEvent" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actorKey" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "choices" JSONB NOT NULL DEFAULT '[]',
    "selectedKey" TEXT,
    "dueDay" INTEGER,
    "memoryTags" JSONB NOT NULL DEFAULT '[]',
    "createdDay" INTEGER NOT NULL,
    "resolvedDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "DirectorEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorPulsePost" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "trust" DOUBLE PRECISION NOT NULL,
    "reach" INTEGER NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorPulsePost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorAchievement" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "seenAt" TIMESTAMP(3),
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorAchievement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorMatch" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "scheduledDay" INTEGER NOT NULL,
    "homeClubId" TEXT NOT NULL,
    "awayClubId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "homeXg" DOUBLE PRECISION,
    "awayXg" DOUBLE PRECISION,
    "homeStrength" DOUBLE PRECISION,
    "awayStrength" DOUBLE PRECISION,
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "coachReport" JSONB NOT NULL DEFAULT '{}',
    "playedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorMatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorNegotiation" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sellingClubId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "round" INTEGER NOT NULL DEFAULT 0,
    "patience" INTEGER NOT NULL DEFAULT 3,
    "referenceValue" INTEGER NOT NULL,
    "clubPriorities" JSONB NOT NULL,
    "playerPriorities" JSONB NOT NULL,
    "lastOffer" JSONB,
    "response" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectorNegotiation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorProject" (
    "id" TEXT NOT NULL,
    "careerId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedDay" INTEGER NOT NULL,
    "finishDay" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "effects" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "DirectorProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DirectorCareer_userId_status_idx" ON "DirectorCareer"("userId", "status");
CREATE INDEX "DirectorCareer_ownerEmail_createdAt_idx" ON "DirectorCareer"("ownerEmail", "createdAt");
CREATE UNIQUE INDEX "DirectorClub_careerId_externalTeamId_key" ON "DirectorClub"("careerId", "externalTeamId");
CREATE INDEX "DirectorClub_careerId_isManaged_idx" ON "DirectorClub"("careerId", "isManaged");
CREATE INDEX "DirectorPlayer_clubId_position_idx" ON "DirectorPlayer"("clubId", "position");
CREATE INDEX "DirectorPlayer_marketValue_idx" ON "DirectorPlayer"("marketValue");
CREATE INDEX "DirectorCoach_clubId_idx" ON "DirectorCoach"("clubId");
CREATE INDEX "DirectorEvent_careerId_status_createdDay_idx" ON "DirectorEvent"("careerId", "status", "createdDay");
CREATE INDEX "DirectorEvent_careerId_templateId_idx" ON "DirectorEvent"("careerId", "templateId");
CREATE INDEX "DirectorPulsePost_careerId_dayIndex_idx" ON "DirectorPulsePost"("careerId", "dayIndex");
CREATE UNIQUE INDEX "DirectorAchievement_careerId_key_key" ON "DirectorAchievement"("careerId", "key");
CREATE INDEX "DirectorAchievement_careerId_unlockedAt_idx" ON "DirectorAchievement"("careerId", "unlockedAt");
CREATE UNIQUE INDEX "DirectorMatch_careerId_round_key" ON "DirectorMatch"("careerId", "round");
CREATE INDEX "DirectorMatch_careerId_scheduledDay_idx" ON "DirectorMatch"("careerId", "scheduledDay");
CREATE INDEX "DirectorNegotiation_careerId_status_idx" ON "DirectorNegotiation"("careerId", "status");
CREATE UNIQUE INDEX "DirectorNegotiation_careerId_playerId_status_key" ON "DirectorNegotiation"("careerId", "playerId", "status");
CREATE INDEX "DirectorProject_careerId_status_idx" ON "DirectorProject"("careerId", "status");

ALTER TABLE "DirectorCareer" ADD CONSTRAINT "DirectorCareer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorClub" ADD CONSTRAINT "DirectorClub_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPlayer" ADD CONSTRAINT "DirectorPlayer_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "DirectorClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorCoach" ADD CONSTRAINT "DirectorCoach_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "DirectorClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorEvent" ADD CONSTRAINT "DirectorEvent_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPulsePost" ADD CONSTRAINT "DirectorPulsePost_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorAchievement" ADD CONSTRAINT "DirectorAchievement_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorMatch" ADD CONSTRAINT "DirectorMatch_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorNegotiation" ADD CONSTRAINT "DirectorNegotiation_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorProject" ADD CONSTRAINT "DirectorProject_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
