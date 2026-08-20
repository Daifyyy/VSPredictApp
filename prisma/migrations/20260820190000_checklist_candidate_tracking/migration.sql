ALTER TABLE "NotificationPreference"
ADD COLUMN "checklistCandidate" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ChecklistDecisionSnapshot" (
  "id" TEXT NOT NULL,
  "fixtureId" INTEGER NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL,
  "market" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "line" DOUBLE PRECISION,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "modelProbability" DOUBLE PRECISION NOT NULL,
  "marketProbability" DOUBLE PRECISION NOT NULL,
  "edge" DOUBLE PRECISION NOT NULL,
  "decimalOdds" DOUBLE PRECISION,
  "bookmaker" TEXT,
  "sampleCount" INTEGER NOT NULL,
  "modelContext" TEXT NOT NULL,
  "modelVersion" INTEGER NOT NULL,
  "contextVersion" INTEGER NOT NULL,
  "checklistVersion" INTEGER NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "candidateAt" TIMESTAMP(3),
  CONSTRAINT "ChecklistDecisionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChecklistDecisionSnapshot_fixtureId_market_checklistVersion_key"
ON "ChecklistDecisionSnapshot"("fixtureId", "market", "checklistVersion");
CREATE INDEX "ChecklistDecisionSnapshot_status_kickoff_idx"
ON "ChecklistDecisionSnapshot"("status", "kickoff");
CREATE INDEX "ChecklistDecisionSnapshot_modelContext_market_candidateAt_idx"
ON "ChecklistDecisionSnapshot"("modelContext", "market", "candidateAt");
