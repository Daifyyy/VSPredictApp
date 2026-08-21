CREATE TABLE "AutonomousTipSnapshot" (
  "id" TEXT NOT NULL,
  "fixtureId" INTEGER NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL,
  "homeTeamId" INTEGER NOT NULL,
  "awayTeamId" INTEGER NOT NULL,
  "homeName" TEXT NOT NULL,
  "awayName" TEXT NOT NULL,
  "homeLogo" TEXT,
  "awayLogo" TEXT,
  "strategy" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "market" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "line" DOUBLE PRECISION,
  "modelProbability" DOUBLE PRECISION NOT NULL,
  "marketProbability" DOUBLE PRECISION NOT NULL,
  "edge" DOUBLE PRECISION NOT NULL,
  "expectedValue" DOUBLE PRECISION,
  "decimalOdds" DOUBLE PRECISION,
  "bookmaker" TEXT,
  "sampleCount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "stake" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "modelContext" TEXT NOT NULL,
  "modelVersion" INTEGER NOT NULL,
  "contextVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "qualifiedAt" TIMESTAMP(3),
  "closingMarketProbability" DOUBLE PRECISION,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "AutonomousTipSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutonomousTipSnapshot_fixtureId_strategy_policyVersion_key"
ON "AutonomousTipSnapshot"("fixtureId", "strategy", "policyVersion");
CREATE INDEX "AutonomousTipSnapshot_strategy_modelContext_qualifiedAt_idx"
ON "AutonomousTipSnapshot"("strategy", "modelContext", "qualifiedAt");
CREATE INDEX "AutonomousTipSnapshot_status_kickoff_idx"
ON "AutonomousTipSnapshot"("status", "kickoff");
CREATE INDEX "AutonomousTipSnapshot_kickoff_idx" ON "AutonomousTipSnapshot"("kickoff");
