CREATE TABLE "ModelOnlyForecast" (
 "id" TEXT PRIMARY KEY, "fixtureId" INTEGER NOT NULL, "dateKey" TEXT NOT NULL,
 "source" TEXT NOT NULL, "artifactId" TEXT NOT NULL DEFAULT '', "modelVersion" INTEGER NOT NULL,
 "contextVersion" INTEGER NOT NULL, "policyVersion" INTEGER NOT NULL, "modelContext" TEXT NOT NULL,
 "leagueId" INTEGER NOT NULL, "homeTeamId" INTEGER NOT NULL, "awayTeamId" INTEGER NOT NULL,
 "homeName" TEXT NOT NULL, "awayName" TEXT NOT NULL, "kickoff" TIMESTAMP(3) NOT NULL,
 "capturedAt" TIMESTAMP(3) NOT NULL, "sourceAt" TIMESTAMP(3) NOT NULL, "market" TEXT NOT NULL, "side" TEXT NOT NULL, "line" DOUBLE PRECISION,
 "probability" DOUBLE PRECISION NOT NULL, "probabilities" JSONB NOT NULL,
 "qualified" BOOLEAN NOT NULL, "reason" TEXT NOT NULL, "readiness" DOUBLE PRECISION NOT NULL,
 "outcome" TEXT NOT NULL DEFAULT 'PENDING', "actualClass" INTEGER, "hit" BOOLEAN, "baselineHit" BOOLEAN,
 "brier" DOUBLE PRECISION, "logLoss" DOUBLE PRECISION, "homeGoals" INTEGER, "awayGoals" INTEGER, "settledAt" TIMESTAMP(3)
);
CREATE INDEX "ModelOnlyForecast_policyVersion_dateKey_idx" ON "ModelOnlyForecast"("policyVersion","dateKey");
CREATE INDEX "ModelOnlyForecast_outcome_kickoff_idx" ON "ModelOnlyForecast"("outcome","kickoff");
CREATE INDEX "ModelOnlyForecast_cohort_idx" ON "ModelOnlyForecast"("source","modelVersion","modelContext","policyVersion");
CREATE TABLE "ModelOnlyDay" (
 "key" TEXT PRIMARY KEY, "dateKey" TEXT NOT NULL, "policyVersion" INTEGER NOT NULL,
 "forecastIds" TEXT[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
