CREATE TABLE "OddsCronLease" (
  "key" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "leaseUntil" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OddsCronLease_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "OddsCronLease_leaseUntil_idx" ON "OddsCronLease"("leaseUntil");

ALTER TABLE "MarketSignalSnapshot"
  ADD COLUMN "openingBookmakerId" INTEGER,
  ADD COLUMN "openingBookmaker" TEXT,
  ADD COLUMN "openingDecimalOdds" DOUBLE PRECISION,
  ADD COLUMN "openingOppositeOdds" DOUBLE PRECISION,
  ADD COLUMN "openingLine" DOUBLE PRECISION,
  ADD COLUMN "openingBenchmarkQuality" TEXT,
  ADD COLUMN "openingBenchmarkProbability" DOUBLE PRECISION,
  ADD COLUMN "closingDecimalOdds" DOUBLE PRECISION,
  ADD COLUMN "closingOppositeOdds" DOUBLE PRECISION,
  ADD COLUMN "closingBookmakerId" INTEGER,
  ADD COLUMN "closingBookmaker" TEXT,
  ADD COLUMN "closingLine" DOUBLE PRECISION,
  ADD COLUMN "closingBenchmarkQuality" TEXT,
  ADD COLUMN "closingBenchmarkProbability" DOUBLE PRECISION,
  ADD COLUMN "closingFreshness" TEXT,
  ADD COLUMN "sameBookClv" BOOLEAN,
  ADD COLUMN "priceClv" DOUBLE PRECISION,
  ADD COLUMN "probabilityClv" DOUBLE PRECISION,
  ADD COLUMN "lineMovement" DOUBLE PRECISION,
  ADD COLUMN "clvMethodVersion" INTEGER;
CREATE INDEX "MarketSignalSnapshot_market_policyVersion_clvMethodVersion_closedAt_idx"
  ON "MarketSignalSnapshot"("market", "policyVersion", "clvMethodVersion", "closedAt");

ALTER TABLE "AutonomousTipSnapshot"
  ADD COLUMN "openingBookmakerId" INTEGER,
  ADD COLUMN "openingBookmaker" TEXT,
  ADD COLUMN "openingDecimalOdds" DOUBLE PRECISION,
  ADD COLUMN "openingOppositeOdds" DOUBLE PRECISION,
  ADD COLUMN "openingLine" DOUBLE PRECISION,
  ADD COLUMN "openingBenchmarkQuality" TEXT,
  ADD COLUMN "openingBenchmarkProbability" DOUBLE PRECISION,
  ADD COLUMN "closingDecimalOdds" DOUBLE PRECISION,
  ADD COLUMN "closingOppositeOdds" DOUBLE PRECISION,
  ADD COLUMN "closingBookmakerId" INTEGER,
  ADD COLUMN "closingBookmaker" TEXT,
  ADD COLUMN "closingLine" DOUBLE PRECISION,
  ADD COLUMN "closingBenchmarkQuality" TEXT,
  ADD COLUMN "closingBenchmarkProbability" DOUBLE PRECISION,
  ADD COLUMN "closingFreshness" TEXT,
  ADD COLUMN "sameBookClv" BOOLEAN,
  ADD COLUMN "priceClv" DOUBLE PRECISION,
  ADD COLUMN "probabilityClv" DOUBLE PRECISION,
  ADD COLUMN "lineMovement" DOUBLE PRECISION,
  ADD COLUMN "clvMethodVersion" INTEGER;
CREATE INDEX "AutonomousTipSnapshot_strategy_policyVersion_clvMethodVersion_closedAt_idx"
  ON "AutonomousTipSnapshot"("strategy", "policyVersion", "clvMethodVersion", "closedAt");

ALTER TABLE "IntuitionTicketLeg"
  ADD COLUMN "closingDecimalOdds" DOUBLE PRECISION,
  ADD COLUMN "closingBookmaker" TEXT,
  ADD COLUMN "closingAt" TIMESTAMP(3),
  ADD COLUMN "closingFreshness" TEXT,
  ADD COLUMN "priceClv" DOUBLE PRECISION,
  ADD COLUMN "clvMethodVersion" INTEGER;
CREATE INDEX "IntuitionTicketLeg_clvMethodVersion_closingAt_idx"
  ON "IntuitionTicketLeg"("clvMethodVersion", "closingAt");
