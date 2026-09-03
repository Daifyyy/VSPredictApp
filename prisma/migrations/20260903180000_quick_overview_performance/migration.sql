ALTER TABLE "QuickOverviewSelection"
  ADD COLUMN "sourceMarket" TEXT,
  ADD COLUMN "leagueId" INTEGER,
  ADD COLUMN "kickoff" TIMESTAMP(3),
  ADD COLUMN "modelContext" TEXT,
  ADD COLUMN "openingMarketProbability" DOUBLE PRECISION,
  ADD COLUMN "decimalOdds" DOUBLE PRECISION,
  ADD COLUMN "bookmaker" TEXT,
  ADD COLUMN "oddsAt" TIMESTAMP(3),
  ADD COLUMN "closingMarketProbability" DOUBLE PRECISION,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closingQuality" TEXT,
  ADD COLUMN "settlementStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "homeGoals" INTEGER,
  ADD COLUMN "awayGoals" INTEGER,
  ADD COLUMN "actualCount" INTEGER,
  ADD COLUMN "hit" BOOLEAN,
  ADD COLUMN "profit" DOUBLE PRECISION,
  ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE INDEX "QuickOverviewSelection_category_policyVersion_qualifiedAt_idx"
  ON "QuickOverviewSelection"("category", "policyVersion", "qualifiedAt");

CREATE INDEX "QuickOverviewSelection_settledAt_idx"
  ON "QuickOverviewSelection"("settledAt");

CREATE INDEX "QuickOverviewSelection_leagueId_kickoff_idx"
  ON "QuickOverviewSelection"("leagueId", "kickoff");
