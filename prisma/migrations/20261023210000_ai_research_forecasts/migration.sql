CREATE TABLE "AIForecastSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "artifactId" TEXT NOT NULL,
  "modelVersion" INTEGER NOT NULL DEFAULT 1, "policyVersion" INTEGER NOT NULL DEFAULT 1001,
  "modelContext" TEXT NOT NULL DEFAULT 'LEAGUE', "leagueId" INTEGER NOT NULL, "season" INTEGER NOT NULL,
  "homeTeamId" INTEGER NOT NULL, "awayTeamId" INTEGER NOT NULL, "homeName" TEXT NOT NULL, "awayName" TEXT NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL,
  "probability" DOUBLE PRECISION NOT NULL, "coverage" DOUBLE PRECISION NOT NULL,
  "homeSample" INTEGER NOT NULL, "awaySample" INTEGER NOT NULL,
  "inputHash" TEXT NOT NULL, "inputAudit" JSONB NOT NULL,
  "outcome" TEXT NOT NULL DEFAULT 'PENDING', "homeGoals" INTEGER, "awayGoals" INTEGER, "settledAt" TIMESTAMP(3),
  CONSTRAINT "AIForecastSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AIForecastSnapshot_fixtureId_artifactId_key" ON "AIForecastSnapshot"("fixtureId", "artifactId");
CREATE INDEX "AIForecastSnapshot_artifactId_kickoff_idx" ON "AIForecastSnapshot"("artifactId", "kickoff");
CREATE INDEX "AIForecastSnapshot_outcome_kickoff_idx" ON "AIForecastSnapshot"("outcome", "kickoff");
