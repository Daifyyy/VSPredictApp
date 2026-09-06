CREATE TABLE "LiveMatchSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "leagueId" INTEGER NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL, "minute" INTEGER, "status" TEXT NOT NULL,
  "homeGoals" INTEGER, "awayGoals" INTEGER, "homeTeamId" INTEGER NOT NULL,
  "awayTeamId" INTEGER NOT NULL, "venueId" INTEGER, "venueName" TEXT, "homeStats" JSONB, "awayStats" JSONB,
  "events" JSONB, "sourceAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveMatchSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LiveMatchSnapshot_fixtureId_observedAt_key" ON "LiveMatchSnapshot"("fixtureId", "observedAt");
CREATE INDEX "LiveMatchSnapshot_fixtureId_observedAt_idx" ON "LiveMatchSnapshot"("fixtureId", "observedAt");
CREATE INDEX "LiveMatchSnapshot_leagueId_observedAt_idx" ON "LiveMatchSnapshot"("leagueId", "observedAt");

CREATE TABLE "LiveOddsSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "observedAt" TIMESTAMP(3) NOT NULL,
  "bookmakerId" INTEGER, "bookmaker" TEXT NOT NULL, "marketId" INTEGER NOT NULL,
  "market" TEXT NOT NULL, "side" TEXT NOT NULL, "line" DOUBLE PRECISION, "lineKey" TEXT NOT NULL,
  "decimalOdds" DOUBLE PRECISION NOT NULL, "main" BOOLEAN NOT NULL DEFAULT false,
  "blocked" BOOLEAN NOT NULL DEFAULT false, "stopped" BOOLEAN NOT NULL DEFAULT false,
  "sourceAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveOddsSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LiveOddsSnapshot_identity_key" ON "LiveOddsSnapshot"("fixtureId", "observedAt", "bookmaker", "marketId", "side", "lineKey");
CREATE INDEX "LiveOddsSnapshot_fixtureId_market_observedAt_idx" ON "LiveOddsSnapshot"("fixtureId", "market", "observedAt");

CREATE TABLE "LiveModelSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "matchSnapshotId" TEXT NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL, "minute" INTEGER NOT NULL, "modelVersion" INTEGER NOT NULL,
  "probabilities" JSONB NOT NULL, "remainingLambdaHome" DOUBLE PRECISION NOT NULL,
  "remainingLambdaAway" DOUBLE PRECISION NOT NULL, "inputs" JSONB NOT NULL,
  "lowConfidence" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveModelSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LiveModelSnapshot_matchSnapshotId_modelVersion_key" ON "LiveModelSnapshot"("matchSnapshotId", "modelVersion");
CREATE INDEX "LiveModelSnapshot_fixtureId_calculatedAt_idx" ON "LiveModelSnapshot"("fixtureId", "calculatedAt");

CREATE TABLE "LiveCandidateSnapshot" (
  "id" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL, "leagueId" INTEGER NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL, "homeTeamId" INTEGER NOT NULL, "awayTeamId" INTEGER NOT NULL,
  "homeName" TEXT NOT NULL, "awayName" TEXT NOT NULL, "market" TEXT NOT NULL,
  "side" TEXT NOT NULL, "line" DOUBLE PRECISION, "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "modelVersion" INTEGER NOT NULL, "minute" INTEGER NOT NULL, "scoreHome" INTEGER NOT NULL,
  "scoreAway" INTEGER NOT NULL, "modelProbability" DOUBLE PRECISION NOT NULL,
  "marketProbability" DOUBLE PRECISION NOT NULL, "edge" DOUBLE PRECISION NOT NULL,
  "expectedValue" DOUBLE PRECISION NOT NULL, "decimalOdds" DOUBLE PRECISION NOT NULL,
  "bookmaker" TEXT NOT NULL, "qualifiedAt" TIMESTAMP(3) NOT NULL, "reason" TEXT NOT NULL,
  "stake" DOUBLE PRECISION NOT NULL DEFAULT 1, "settlementStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "hit" BOOLEAN, "profit" DOUBLE PRECISION, "settledAt" TIMESTAMP(3),
  "modelSnapshotId" TEXT NOT NULL, "oddsSnapshotId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LiveCandidateSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LiveCandidateSnapshot_fixtureId_market_policyVersion_key" ON "LiveCandidateSnapshot"("fixtureId", "market", "policyVersion");
CREATE INDEX "LiveCandidateSnapshot_market_qualifiedAt_idx" ON "LiveCandidateSnapshot"("market", "qualifiedAt");
CREATE INDEX "LiveCandidateSnapshot_settlementStatus_kickoff_idx" ON "LiveCandidateSnapshot"("settlementStatus", "kickoff");

CREATE TABLE "LiveFixtureWatch" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "fixtureId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "LiveFixtureWatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LiveFixtureWatch_userId_fixtureId_key" ON "LiveFixtureWatch"("userId", "fixtureId");
CREATE INDEX "LiveFixtureWatch_fixtureId_expiresAt_idx" ON "LiveFixtureWatch"("fixtureId", "expiresAt");
CREATE INDEX "LiveFixtureWatch_expiresAt_idx" ON "LiveFixtureWatch"("expiresAt");
ALTER TABLE "LiveFixtureWatch" ADD CONSTRAINT "LiveFixtureWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "VenueCache" (
  "venueId" INTEGER NOT NULL, "name" TEXT, "address" TEXT, "city" TEXT,
  "capacity" INTEGER, "surface" TEXT, "imageUrl" TEXT, "fetchedAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "VenueCache_pkey" PRIMARY KEY ("venueId")
);
