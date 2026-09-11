CREATE TABLE "ClubEloDivergence" (
  "id" TEXT NOT NULL,
  "fixtureId" INTEGER NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "modelVersion" INTEGER NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL,
  "homeName" TEXT NOT NULL,
  "awayName" TEXT NOT NULL,
  "winner" TEXT NOT NULL,
  "winnerName" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "modelProbability" DOUBLE PRECISION NOT NULL,
  "marketProbability" DOUBLE PRECISION NOT NULL,
  "eloRawProbability" DOUBLE PRECISION NOT NULL,
  "eloCalibratedProbability" DOUBLE PRECISION NOT NULL,
  "longProbability" DOUBLE PRECISION NOT NULL,
  "fastProbability" DOUBLE PRECISION NOT NULL,
  "rawEdge" DOUBLE PRECISION NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "homeGoals" INTEGER,
  "awayGoals" INTEGER,
  "hit" BOOLEAN,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "ClubEloDivergence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubEloDivergence_fixtureId_modelVersion_policyVersion_winner_key" ON "ClubEloDivergence"("fixtureId", "modelVersion", "policyVersion", "winner");
CREATE INDEX "ClubEloDivergence_policyVersion_kickoff_idx" ON "ClubEloDivergence"("policyVersion", "kickoff");
CREATE INDEX "ClubEloDivergence_settledAt_kickoff_idx" ON "ClubEloDivergence"("settledAt", "kickoff");
