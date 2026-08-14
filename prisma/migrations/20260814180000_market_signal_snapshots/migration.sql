CREATE TABLE "MarketSignalSnapshot" (
    "id" TEXT NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "market" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "line" DOUBLE PRECISION,
    "modelProbability" DOUBLE PRECISION NOT NULL,
    "openMarketProbability" DOUBLE PRECISION NOT NULL,
    "closeMarketProbability" DOUBLE PRECISION,
    "modelContext" TEXT NOT NULL,
    "modelVersion" INTEGER NOT NULL,
    "contextVersion" INTEGER NOT NULL,
    "countModelVersion" INTEGER,
    "policyVersion" INTEGER NOT NULL,
    "publishedTip" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "series" JSONB,
    CONSTRAINT "MarketSignalSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketSignalSnapshot_fixtureId_market_policyVersion_key" ON "MarketSignalSnapshot"("fixtureId", "market", "policyVersion");
CREATE INDEX "MarketSignalSnapshot_market_closedAt_idx" ON "MarketSignalSnapshot"("market", "closedAt");
CREATE INDEX "MarketSignalSnapshot_modelContext_market_closedAt_idx" ON "MarketSignalSnapshot"("modelContext", "market", "closedAt");
CREATE INDEX "MarketSignalSnapshot_leagueId_kickoff_idx" ON "MarketSignalSnapshot"("leagueId", "kickoff");
