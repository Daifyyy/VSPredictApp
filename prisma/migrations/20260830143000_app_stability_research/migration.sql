CREATE TABLE "QuickOverviewSelection" (
    "id" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "modelProbability" DOUBLE PRECISION,
    "marketProbability" DOUBLE PRECISION,
    "marketMove" DOUBLE PRECISION,
    "marketSamples" INTEGER NOT NULL DEFAULT 0,
    "side" TEXT,
    "line" DOUBLE PRECISION,
    "modelVersion" INTEGER NOT NULL,
    "contextVersion" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "lowConfidence" BOOLEAN NOT NULL DEFAULT false,
    "readinessSample" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuickOverviewSelection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PwaDiagnostic" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "buildId" TEXT,
    "swState" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PwaDiagnostic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickOverviewSelection_dateKey_category_fixtureId_policyVersion_key" ON "QuickOverviewSelection"("dateKey", "category", "fixtureId", "policyVersion");
CREATE INDEX "QuickOverviewSelection_dateKey_category_rank_idx" ON "QuickOverviewSelection"("dateKey", "category", "rank");
CREATE INDEX "QuickOverviewSelection_fixtureId_idx" ON "QuickOverviewSelection"("fixtureId");
CREATE INDEX "PwaDiagnostic_kind_createdAt_idx" ON "PwaDiagnostic"("kind", "createdAt");
CREATE INDEX "AutonomousTipSnapshot_capturedAt_idx" ON "AutonomousTipSnapshot"("capturedAt");
CREATE INDEX "ChecklistDecisionSnapshot_capturedAt_idx" ON "ChecklistDecisionSnapshot"("capturedAt");
