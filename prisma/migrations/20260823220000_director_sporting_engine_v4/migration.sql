ALTER TABLE "DirectorPlayer"
  ADD COLUMN "tacticalFamiliarity" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "acuteLoad" DOUBLE PRECISION NOT NULL DEFAULT 20,
  ADD COLUMN "chronicLoad" DOUBLE PRECISION NOT NULL DEFAULT 25,
  ADD COLUMN "matchReadiness" DOUBLE PRECISION NOT NULL DEFAULT 85,
  ADD COLUMN "healthRisk" DOUBLE PRECISION NOT NULL DEFAULT 10,
  ADD COLUMN "healthRiskHistory" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "DirectorMatch"
  ADD COLUMN "phaseStats" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "engineVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "DirectorSportPolicy" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "desiredStyle" TEXT NOT NULL DEFAULT 'BALANCED', "youthPreference" DOUBLE PRECISION NOT NULL DEFAULT .5,
  "rotationLevel" DOUBLE PRECISION NOT NULL DEFAULT .5, "trainingIntensity" DOUBLE PRECISION NOT NULL DEFAULT .5,
  "healthRiskTolerance" DOUBLE PRECISION NOT NULL DEFAULT .35, "phasePriorities" JSONB NOT NULL DEFAULT '{}',
  "updatedDay" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DirectorSportPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectorSportPolicy_careerId_clubId_key" ON "DirectorSportPolicy"("careerId", "clubId");
CREATE INDEX "DirectorSportPolicy_careerId_updatedDay_idx" ON "DirectorSportPolicy"("careerId", "updatedDay");

CREATE TABLE "DirectorSportMeeting" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "matchId" TEXT, "coachId" TEXT,
  "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "trigger" TEXT NOT NULL, "title" TEXT NOT NULL,
  "briefing" TEXT NOT NULL, "recommendation" JSONB NOT NULL DEFAULT '{}', "response" JSONB, "resolution" TEXT,
  "createdDay" INTEGER NOT NULL, "dueDay" INTEGER, "resolvedDay" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3), CONSTRAINT "DirectorSportMeeting_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DirectorSportMeeting_careerId_status_dueDay_idx" ON "DirectorSportMeeting"("careerId", "status", "dueDay");
CREATE INDEX "DirectorSportMeeting_matchId_idx" ON "DirectorSportMeeting"("matchId");

CREATE TABLE "DirectorMatchPlan" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "matchId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "coachId" TEXT,
  "side" TEXT NOT NULL, "formation" TEXT NOT NULL, "mentality" TEXT NOT NULL, "lineup" JSONB NOT NULL,
  "bench" JSONB NOT NULL, "roles" JSONB NOT NULL, "phaseProfile" JSONB NOT NULL, "selectionReasons" JSONB NOT NULL,
  "weaknesses" JSONB NOT NULL, "confidence" DOUBLE PRECISION NOT NULL, "engineVersion" INTEGER NOT NULL DEFAULT 4,
  "createdDay" INTEGER NOT NULL, "lockedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectorMatchPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectorMatchPlan_matchId_clubId_key" ON "DirectorMatchPlan"("matchId", "clubId");
CREATE INDEX "DirectorMatchPlan_careerId_createdDay_idx" ON "DirectorMatchPlan"("careerId", "createdDay");

CREATE TABLE "DirectorPlayerAppearance" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "matchId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "clubId" TEXT NOT NULL,
  "role" TEXT NOT NULL, "started" BOOLEAN NOT NULL DEFAULT false, "minutes" INTEGER NOT NULL, "performance" DOUBLE PRECISION,
  "load" DOUBLE PRECISION NOT NULL, "injuryDays" INTEGER NOT NULL DEFAULT 0, "substitutionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorPlayerAppearance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DirectorPlayerAppearance_matchId_playerId_key" ON "DirectorPlayerAppearance"("matchId", "playerId");
CREATE INDEX "DirectorPlayerAppearance_careerId_playerId_idx" ON "DirectorPlayerAppearance"("careerId", "playerId");

ALTER TABLE "DirectorSportPolicy" ADD CONSTRAINT "DirectorSportPolicy_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorSportMeeting" ADD CONSTRAINT "DirectorSportMeeting_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorMatchPlan" ADD CONSTRAINT "DirectorMatchPlan_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorMatchPlan" ADD CONSTRAINT "DirectorMatchPlan_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "DirectorMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPlayerAppearance" ADD CONSTRAINT "DirectorPlayerAppearance_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPlayerAppearance" ADD CONSTRAINT "DirectorPlayerAppearance_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "DirectorMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPlayerAppearance" ADD CONSTRAINT "DirectorPlayerAppearance_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "DirectorPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
