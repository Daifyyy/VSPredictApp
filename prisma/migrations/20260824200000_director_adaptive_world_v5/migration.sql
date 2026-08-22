ALTER TABLE "DirectorPlayer"
  ADD COLUMN "healthStatus" TEXT NOT NULL DEFAULT 'FIT',
  ADD COLUMN "healthIssueType" TEXT,
  ADD COLUMN "returnDay" INTEGER,
  ADD COLUMN "returnWindowMin" INTEGER,
  ADD COLUMN "returnWindowMax" INTEGER,
  ADD COLUMN "minutesLimit" INTEGER,
  ADD COLUMN "recurrenceRisk" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "DirectorMatchPlan"
  ADD COLUMN "familiarity" DOUBLE PRECISION NOT NULL DEFAULT 50,
  ADD COLUMN "predictability" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "cohesionCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "changeMagnitude" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "uncertainty" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "DirectorCoachMemory" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "coachId" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "phaseAssessment" JSONB NOT NULL DEFAULT '{}', "tacticalBudget" DOUBLE PRECISION NOT NULL DEFAULT 300, "systemFamiliarity" DOUBLE PRECISION NOT NULL DEFAULT 50, "predictability" DOUBLE PRECISION NOT NULL DEFAULT 0, "lastFormation" TEXT, "lastStyle" TEXT, "recentPlans" JSONB NOT NULL DEFAULT '[]', "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0, "updatedDay" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DirectorCoachMemory_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorCoachMemory_careerId_clubId_coachId_key" ON "DirectorCoachMemory"("careerId", "clubId", "coachId");
CREATE INDEX "DirectorCoachMemory_careerId_updatedDay_idx" ON "DirectorCoachMemory"("careerId", "updatedDay");

CREATE TABLE "DirectorTrainingCycle" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "dayIndex" INTEGER NOT NULL, "kind" TEXT NOT NULL, "intensity" DOUBLE PRECISION NOT NULL, "focus" TEXT NOT NULL, "congestion" DOUBLE PRECISION NOT NULL DEFAULT 0, "effects" JSONB NOT NULL, "explanation" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorTrainingCycle_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorTrainingCycle_careerId_clubId_dayIndex_key" ON "DirectorTrainingCycle"("careerId", "clubId", "dayIndex");
CREATE INDEX "DirectorTrainingCycle_careerId_dayIndex_idx" ON "DirectorTrainingCycle"("careerId", "dayIndex");

CREATE TABLE "DirectorOpponentAnalysis" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "matchId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "opponentClubId" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "dataCutoffDay" INTEGER NOT NULL, "sampleSize" INTEGER NOT NULL, "tendencies" JSONB NOT NULL, "keyDuels" JSONB NOT NULL, "predictability" DOUBLE PRECISION NOT NULL, "uncertainty" DOUBLE PRECISION NOT NULL, "explanation" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorOpponentAnalysis_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorOpponentAnalysis_matchId_clubId_key" ON "DirectorOpponentAnalysis"("matchId", "clubId");
CREATE INDEX "DirectorOpponentAnalysis_careerId_dataCutoffDay_idx" ON "DirectorOpponentAnalysis"("careerId", "dataCutoffDay");

CREATE TABLE "DirectorMedicalReport" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "dayIndex" INTEGER NOT NULL, "status" TEXT NOT NULL, "issueType" TEXT, "readiness" DOUBLE PRECISION NOT NULL, "recurrenceRisk" DOUBLE PRECISION NOT NULL, "estimatedMinDay" INTEGER, "estimatedMaxDay" INTEGER, "minutesLimit" INTEGER, "uncertainty" DOUBLE PRECISION NOT NULL, "explanation" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorMedicalReport_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorMedicalReport_careerId_playerId_dayIndex_key" ON "DirectorMedicalReport"("careerId", "playerId", "dayIndex");
CREATE INDEX "DirectorMedicalReport_careerId_clubId_dayIndex_idx" ON "DirectorMedicalReport"("careerId", "clubId", "dayIndex");

CREATE TABLE "DirectorPlanReview" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "matchId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "coachId" TEXT, "planId" TEXT, "version" INTEGER NOT NULL DEFAULT 1, "phasePerformance" JSONB NOT NULL, "execution" DOUBLE PRECISION NOT NULL, "finishingLuck" DOUBLE PRECISION NOT NULL, "lessons" JSONB NOT NULL, "adaptation" JSONB NOT NULL, "confidence" DOUBLE PRECISION NOT NULL, "createdDay" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorPlanReview_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorPlanReview_matchId_clubId_key" ON "DirectorPlanReview"("matchId", "clubId");
CREATE INDEX "DirectorPlanReview_careerId_createdDay_idx" ON "DirectorPlanReview"("careerId", "createdDay");

ALTER TABLE "DirectorCoachMemory" ADD CONSTRAINT "DirectorCoachMemory_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorTrainingCycle" ADD CONSTRAINT "DirectorTrainingCycle_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorOpponentAnalysis" ADD CONSTRAINT "DirectorOpponentAnalysis_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorMedicalReport" ADD CONSTRAINT "DirectorMedicalReport_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPlanReview" ADD CONSTRAINT "DirectorPlanReview_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
