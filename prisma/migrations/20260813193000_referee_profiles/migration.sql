ALTER TABLE "FixturePrediction"
  ADD COLUMN "refereeName" TEXT,
  ADD COLUMN "refereeKey" TEXT,
  ADD COLUMN "lambdaCardsHomeBeforeRef" DOUBLE PRECISION,
  ADD COLUMN "lambdaCardsAwayBeforeRef" DOUBLE PRECISION;

CREATE TABLE "RefereeMatch" (
  "fixtureId" INTEGER NOT NULL,
  "refereeName" TEXT NOT NULL,
  "refereeKey" TEXT NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "modelContext" TEXT NOT NULL,
  "contextVersion" INTEGER NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL,
  "fouls" DOUBLE PRECISION,
  "yellowCards" DOUBLE PRECISION NOT NULL,
  "redCards" DOUBLE PRECISION NOT NULL,
  "actualCards" DOUBLE PRECISION NOT NULL,
  "expectedCards" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefereeMatch_pkey" PRIMARY KEY ("fixtureId")
);

CREATE INDEX "RefereeMatch_refereeKey_modelContext_kickoff_idx"
  ON "RefereeMatch"("refereeKey", "modelContext", "kickoff");
CREATE INDEX "RefereeMatch_leagueId_kickoff_idx"
  ON "RefereeMatch"("leagueId", "kickoff");
