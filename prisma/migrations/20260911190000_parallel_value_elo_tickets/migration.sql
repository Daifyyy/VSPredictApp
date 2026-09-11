ALTER TABLE "IntuitionTicket" ADD COLUMN "strategy" TEXT NOT NULL DEFAULT 'VALUE';
DROP INDEX "IntuitionTicket_windowKey_slot_policyVersion_key";
CREATE UNIQUE INDEX "IntuitionTicket_windowKey_strategy_slot_policyVersion_key" ON "IntuitionTicket"("windowKey", "strategy", "slot", "policyVersion");
CREATE INDEX "IntuitionTicket_strategy_status_settledAt_idx" ON "IntuitionTicket"("strategy", "status", "settledAt");

ALTER TABLE "IntuitionTicketLeg"
  ADD COLUMN "eloLongProbability" DOUBLE PRECISION,
  ADD COLUMN "eloFastProbability" DOUBLE PRECISION,
  ADD COLUMN "eloWinnerProbability" DOUBLE PRECISION,
  ADD COLUMN "eloJointProbability" DOUBLE PRECISION,
  ADD COLUMN "eloLongHomeRating" DOUBLE PRECISION,
  ADD COLUMN "eloLongAwayRating" DOUBLE PRECISION,
  ADD COLUMN "eloFastHomeRating" DOUBLE PRECISION,
  ADD COLUMN "eloFastAwayRating" DOUBLE PRECISION,
  ADD COLUMN "eloLongSample" DOUBLE PRECISION,
  ADD COLUMN "eloFastSample" DOUBLE PRECISION,
  ADD COLUMN "modelExpectedValue" DOUBLE PRECISION,
  ADD COLUMN "eloExpectedValue" DOUBLE PRECISION;

CREATE TABLE "ClubEloMatch" (
  "fixtureId" INTEGER NOT NULL, "leagueId" INTEGER NOT NULL, "season" INTEGER NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL, "homeTeamId" INTEGER NOT NULL, "awayTeamId" INTEGER NOT NULL,
  "homeGoals" INTEGER NOT NULL, "awayGoals" INTEGER NOT NULL, "neutral" BOOLEAN NOT NULL DEFAULT false,
  "context" TEXT NOT NULL DEFAULT 'LEAGUE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ClubEloMatch_pkey" PRIMARY KEY ("fixtureId")
);
CREATE INDEX "ClubEloMatch_kickoff_fixtureId_idx" ON "ClubEloMatch"("kickoff", "fixtureId");
CREATE INDEX "ClubEloMatch_leagueId_season_idx" ON "ClubEloMatch"("leagueId", "season");

CREATE TABLE "ClubEloState" (
  "id" TEXT NOT NULL, "modelVersion" INTEGER NOT NULL, "teamId" INTEGER NOT NULL, "leagueId" INTEGER NOT NULL,
  "longRating" DOUBLE PRECISION NOT NULL, "fastRating" DOUBLE PRECISION NOT NULL,
  "longSample" DOUBLE PRECISION NOT NULL, "fastSample" DOUBLE PRECISION NOT NULL,
  "lastMatchAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClubEloState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubEloState_modelVersion_teamId_key" ON "ClubEloState"("modelVersion", "teamId");
CREATE INDEX "ClubEloState_modelVersion_leagueId_idx" ON "ClubEloState"("modelVersion", "leagueId");

CREATE TABLE "ClubEloFixtureSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "modelVersion" INTEGER NOT NULL, "generatedAt" TIMESTAMP(3) NOT NULL,
  "homeLongRating" DOUBLE PRECISION NOT NULL, "awayLongRating" DOUBLE PRECISION NOT NULL,
  "homeFastRating" DOUBLE PRECISION NOT NULL, "awayFastRating" DOUBLE PRECISION NOT NULL,
  "homeLongSample" DOUBLE PRECISION NOT NULL, "awayLongSample" DOUBLE PRECISION NOT NULL,
  "homeFastSample" DOUBLE PRECISION NOT NULL, "awayFastSample" DOUBLE PRECISION NOT NULL,
  "homeProbability" DOUBLE PRECISION NOT NULL, "drawProbability" DOUBLE PRECISION NOT NULL, "awayProbability" DOUBLE PRECISION NOT NULL,
  "longHomeProb" DOUBLE PRECISION NOT NULL, "longAwayProb" DOUBLE PRECISION NOT NULL,
  "fastHomeProb" DOUBLE PRECISION NOT NULL, "fastAwayProb" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "ClubEloFixtureSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubEloFixtureSnapshot_fixtureId_modelVersion_key" ON "ClubEloFixtureSnapshot"("fixtureId", "modelVersion");
CREATE INDEX "ClubEloFixtureSnapshot_modelVersion_generatedAt_idx" ON "ClubEloFixtureSnapshot"("modelVersion", "generatedAt");

CREATE TABLE "ClubEloModelDefinition" (
  "id" TEXT NOT NULL, "version" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "parameters" JSONB NOT NULL,
  "trainedThrough" TIMESTAMP(3), "metrics" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3), CONSTRAINT "ClubEloModelDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubEloModelDefinition_version_key" ON "ClubEloModelDefinition"("version");
