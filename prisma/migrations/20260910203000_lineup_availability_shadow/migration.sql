CREATE TABLE "LeagueDataCoverage" (
  "id" TEXT NOT NULL, "leagueId" INTEGER NOT NULL, "season" INTEGER NOT NULL,
  "modelContext" TEXT NOT NULL, "events" BOOLEAN NOT NULL DEFAULT false,
  "lineups" BOOLEAN NOT NULL DEFAULT false, "fixtureStats" BOOLEAN NOT NULL DEFAULT false,
  "playerStats" BOOLEAN NOT NULL DEFAULT false, "standings" BOOLEAN NOT NULL DEFAULT false,
  "injuries" BOOLEAN NOT NULL DEFAULT false, "predictions" BOOLEAN NOT NULL DEFAULT false,
  "prematchOdds" BOOLEAN NOT NULL DEFAULT false, "liveOdds" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'NOT_YET_AVAILABLE', "sourceVersion" INTEGER NOT NULL DEFAULT 1,
  "verifiedAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "LeagueDataCoverage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeagueDataCoverage_leagueId_season_sourceVersion_key" ON "LeagueDataCoverage"("leagueId", "season", "sourceVersion");
CREATE INDEX "LeagueDataCoverage_modelContext_status_verifiedAt_idx" ON "LeagueDataCoverage"("modelContext", "status", "verifiedAt");

CREATE TABLE "FixtureAvailabilitySnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "kickoff" TIMESTAMP(3) NOT NULL,
  "teamId" INTEGER NOT NULL, "playerId" INTEGER, "playerName" TEXT NOT NULL,
  "availabilityType" TEXT NOT NULL, "reason" TEXT, "status" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL, "sourceAt" TIMESTAMP(3), "capturedAt" TIMESTAMP(3) NOT NULL,
  "normalizationVersion" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixtureAvailabilitySnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FixtureAvailabilitySnapshot_fixtureId_teamId_playerName_availabilityType_capturedAt_key" ON "FixtureAvailabilitySnapshot"("fixtureId", "teamId", "playerName", "availabilityType", "capturedAt");
CREATE INDEX "FixtureAvailabilitySnapshot_fixtureId_capturedAt_idx" ON "FixtureAvailabilitySnapshot"("fixtureId", "capturedAt");
CREATE INDEX "FixtureAvailabilitySnapshot_teamId_kickoff_idx" ON "FixtureAvailabilitySnapshot"("teamId", "kickoff");

CREATE TABLE "FixtureLineupSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "kickoff" TIMESTAMP(3) NOT NULL,
  "teamId" INTEGER NOT NULL, "status" TEXT NOT NULL, "formation" TEXT, "coachId" INTEGER,
  "coachName" TEXT, "publishedAt" TIMESTAMP(3), "capturedAt" TIMESTAMP(3) NOT NULL,
  "parserVersion" INTEGER NOT NULL DEFAULT 1, "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourceKind" TEXT NOT NULL DEFAULT 'PROSPECTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixtureLineupSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FixtureLineupSnapshot_fixtureId_teamId_capturedAt_key" ON "FixtureLineupSnapshot"("fixtureId", "teamId", "capturedAt");
CREATE INDEX "FixtureLineupSnapshot_fixtureId_capturedAt_idx" ON "FixtureLineupSnapshot"("fixtureId", "capturedAt");
CREATE INDEX "FixtureLineupSnapshot_teamId_kickoff_idx" ON "FixtureLineupSnapshot"("teamId", "kickoff");

CREATE TABLE "FixtureLineupPlayer" (
  "id" TEXT NOT NULL, "snapshotId" TEXT NOT NULL, "playerId" INTEGER, "playerName" TEXT NOT NULL,
  "role" TEXT NOT NULL, "position" TEXT, "shirtNumber" INTEGER, "sourceOrder" INTEGER NOT NULL,
  "expectedPlayer" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixtureLineupPlayer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FixtureLineupPlayer_snapshotId_role_sourceOrder_key" ON "FixtureLineupPlayer"("snapshotId", "role", "sourceOrder");
CREATE INDEX "FixtureLineupPlayer_playerId_idx" ON "FixtureLineupPlayer"("playerId");
ALTER TABLE "FixtureLineupPlayer" ADD CONSTRAINT "FixtureLineupPlayer_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "FixtureLineupSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlayerSeasonSnapshot" (
  "id" TEXT NOT NULL, "playerId" INTEGER NOT NULL, "playerName" TEXT NOT NULL, "teamId" INTEGER NOT NULL,
  "leagueId" INTEGER NOT NULL, "season" INTEGER NOT NULL, "position" TEXT, "minutes" INTEGER,
  "starts" INTEGER, "appearances" INTEGER, "rating" DOUBLE PRECISION, "goals" INTEGER, "assists" INTEGER,
  "shots" INTEGER, "shotsOnTarget" INTEGER, "passes" INTEGER, "keyPasses" INTEGER,
  "yellowCards" INTEGER, "redCards" INTEGER, "saves" INTEGER, "conceded" INTEGER, "metrics" JSONB,
  "sourceAt" TIMESTAMP(3), "capturedAt" TIMESTAMP(3) NOT NULL, "parserVersion" INTEGER NOT NULL DEFAULT 1,
  "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerSeasonSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerSeasonSnapshot_playerId_teamId_leagueId_season_capturedAt_key" ON "PlayerSeasonSnapshot"("playerId", "teamId", "leagueId", "season", "capturedAt");
CREATE INDEX "PlayerSeasonSnapshot_teamId_leagueId_season_capturedAt_idx" ON "PlayerSeasonSnapshot"("teamId", "leagueId", "season", "capturedAt");

CREATE TABLE "PlayerMatchSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "playerId" INTEGER NOT NULL, "playerName" TEXT NOT NULL,
  "teamId" INTEGER NOT NULL, "starter" BOOLEAN, "position" TEXT, "minutes" INTEGER, "rating" DOUBLE PRECISION,
  "goals" INTEGER, "assists" INTEGER, "shots" INTEGER, "shotsOnTarget" INTEGER, "passes" INTEGER,
  "keyPasses" INTEGER, "tackles" INTEGER, "interceptions" INTEGER, "duels" INTEGER, "duelsWon" INTEGER,
  "yellowCards" INTEGER, "redCards" INTEGER, "saves" INTEGER, "conceded" INTEGER, "metrics" JSONB,
  "sourceAt" TIMESTAMP(3), "capturedAt" TIMESTAMP(3) NOT NULL, "parserVersion" INTEGER NOT NULL DEFAULT 1,
  "completeness" DOUBLE PRECISION NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerMatchSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerMatchSnapshot_fixtureId_playerId_key" ON "PlayerMatchSnapshot"("fixtureId", "playerId");
CREATE INDEX "PlayerMatchSnapshot_teamId_capturedAt_idx" ON "PlayerMatchSnapshot"("teamId", "capturedAt");
CREATE INDEX "PlayerMatchSnapshot_fixtureId_idx" ON "PlayerMatchSnapshot"("fixtureId");

CREATE TABLE "FixturePersonnelFeatures" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "teamId" INTEGER NOT NULL, "kickoff" TIMESTAMP(3) NOT NULL,
  "lineupSnapshotId" TEXT, "availabilityCapturedAt" TIMESTAMP(3), "calculatedAt" TIMESTAMP(3) NOT NULL,
  "featureVersion" INTEGER NOT NULL DEFAULT 1, "lineupChanges" INTEGER, "regularStarters" INTEGER,
  "defenseContinuity" DOUBLE PRECISION, "goalkeeperContinuity" BOOLEAN, "sharedMinutesRatio" DOUBLE PRECISION,
  "formationChanged" BOOLEAN, "coachChangedRecently" BOOLEAN, "coachMatches" INTEGER,
  "startingStrength" DOUBLE PRECISION, "benchStrength" DOUBLE PRECISION, "strengthLoss" DOUBLE PRECISION,
  "missingGoalkeeper" BOOLEAN, "missingKeyScorer" BOOLEAN, "importantAbsences" INTEGER,
  "completeness" DOUBLE PRECISION NOT NULL, "features" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FixturePersonnelFeatures_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FixturePersonnelFeatures_fixtureId_teamId_featureVersion_calculatedAt_key" ON "FixturePersonnelFeatures"("fixtureId", "teamId", "featureVersion", "calculatedAt");
CREATE INDEX "FixturePersonnelFeatures_fixtureId_calculatedAt_idx" ON "FixturePersonnelFeatures"("fixtureId", "calculatedAt");
CREATE INDEX "FixturePersonnelFeatures_teamId_kickoff_idx" ON "FixturePersonnelFeatures"("teamId", "kickoff");

CREATE TABLE "ShadowForecastSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "kickoff" TIMESTAMP(3) NOT NULL,
  "baselineModelVersion" INTEGER NOT NULL, "shadowModelVersion" INTEGER NOT NULL DEFAULT 1,
  "calculatedAt" TIMESTAMP(3) NOT NULL, "finalized" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL,
  "homeFeatureId" TEXT, "awayFeatureId" TEXT, "baselineLambdaHome" DOUBLE PRECISION NOT NULL,
  "baselineLambdaAway" DOUBLE PRECISION NOT NULL, "shadowLambdaHome" DOUBLE PRECISION NOT NULL,
  "shadowLambdaAway" DOUBLE PRECISION NOT NULL, "baselineProbabilities" JSONB NOT NULL,
  "shadowProbabilities" JSONB NOT NULL, "inputs" JSONB NOT NULL, "completeness" DOUBLE PRECISION NOT NULL,
  "explanations" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShadowForecastSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShadowForecastSnapshot_fixtureId_shadowModelVersion_calculatedAt_key" ON "ShadowForecastSnapshot"("fixtureId", "shadowModelVersion", "calculatedAt");
CREATE INDEX "ShadowForecastSnapshot_fixtureId_calculatedAt_idx" ON "ShadowForecastSnapshot"("fixtureId", "calculatedAt");
CREATE INDEX "ShadowForecastSnapshot_status_createdAt_idx" ON "ShadowForecastSnapshot"("status", "createdAt");

CREATE TABLE "ShadowModelReport" (
  "id" TEXT NOT NULL, "shadowModelVersion" INTEGER NOT NULL, "datasetCutoff" TIMESTAMP(3) NOT NULL,
  "sampleSize" INTEGER NOT NULL, "trainingTo" TIMESTAMP(3), "holdoutFrom" TIMESTAMP(3),
  "metrics" JSONB NOT NULL, "gates" JSONB NOT NULL, "coefficients" JSONB,
  "recommendation" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShadowModelReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShadowModelReport_shadowModelVersion_datasetCutoff_key" ON "ShadowModelReport"("shadowModelVersion", "datasetCutoff");
CREATE INDEX "ShadowModelReport_createdAt_idx" ON "ShadowModelReport"("createdAt");
