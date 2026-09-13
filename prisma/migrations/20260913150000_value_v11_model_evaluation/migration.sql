ALTER TABLE "IntuitionTicketLeg"
  ADD COLUMN "marketAnchorProbability" DOUBLE PRECISION,
  ADD COLUMN "decisionProbability" DOUBLE PRECISION,
  ADD COLUMN "decisionExpectedValue" DOUBLE PRECISION,
  ADD COLUMN "modelWeight" DOUBLE PRECISION,
  ADD COLUMN "conditionRetention" DOUBLE PRECISION,
  ADD COLUMN "conditionOddsUplift" DOUBLE PRECISION,
  ADD COLUMN "conditionEfficiency" DOUBLE PRECISION,
  ADD COLUMN "priceUncertainty" TEXT,
  ADD COLUMN "leagueReliability" DOUBLE PRECISION,
  ADD COLUMN "modelPredictionVersion" INTEGER,
  ADD COLUMN "decisionPolicyVersion" INTEGER;

CREATE TABLE "ModelEvaluationSnapshot" (
  "id" TEXT NOT NULL,
  "modelVersion" INTEGER NOT NULL,
  "modelContext" TEXT NOT NULL,
  "contextVersion" INTEGER NOT NULL,
  "evaluationVersion" INTEGER NOT NULL DEFAULT 1,
  "datasetCutoff" TIMESTAMP(3) NOT NULL,
  "windowType" TEXT NOT NULL,
  "leagueId" INTEGER NOT NULL DEFAULT 0,
  "sampleSize" INTEGER NOT NULL,
  "fromKickoff" TIMESTAMP(3),
  "toKickoff" TIMESTAMP(3),
  "modelAccuracy" DOUBLE PRECISION,
  "modelLogLoss" DOUBLE PRECISION,
  "modelBrier" DOUBLE PRECISION,
  "modelEce" DOUBLE PRECISION,
  "openingSampleSize" INTEGER NOT NULL DEFAULT 0,
  "openingAccuracy" DOUBLE PRECISION,
  "openingLogLoss" DOUBLE PRECISION,
  "openingBrier" DOUBLE PRECISION,
  "openingEce" DOUBLE PRECISION,
  "closingSampleSize" INTEGER NOT NULL DEFAULT 0,
  "closingAccuracy" DOUBLE PRECISION,
  "closingLogLoss" DOUBLE PRECISION,
  "closingBrier" DOUBLE PRECISION,
  "closingEce" DOUBLE PRECISION,
  "dataQuality" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelEvaluationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MainModelShadowPrediction" (
  "id" TEXT NOT NULL,
  "fixtureId" INTEGER NOT NULL,
  "shadowVersion" INTEGER NOT NULL,
  "sourceModelVersion" INTEGER NOT NULL,
  "modelContext" TEXT NOT NULL,
  "contextVersion" INTEGER NOT NULL,
  "method" TEXT NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "bookmaker" TEXT NOT NULL,
  "marketHome" DOUBLE PRECISION NOT NULL,
  "marketDraw" DOUBLE PRECISION NOT NULL,
  "marketAway" DOUBLE PRECISION NOT NULL,
  "sourceHome" DOUBLE PRECISION NOT NULL,
  "sourceDraw" DOUBLE PRECISION NOT NULL,
  "sourceAway" DOUBLE PRECISION NOT NULL,
  "eloHome" DOUBLE PRECISION,
  "eloDraw" DOUBLE PRECISION,
  "eloAway" DOUBLE PRECISION,
  "homeProbability" DOUBLE PRECISION NOT NULL,
  "drawProbability" DOUBLE PRECISION NOT NULL,
  "awayProbability" DOUBLE PRECISION NOT NULL,
  "marketWeight" DOUBLE PRECISION NOT NULL,
  "sourceWeight" DOUBLE PRECISION NOT NULL,
  "eloWeight" DOUBLE PRECISION NOT NULL,
  "eloLongSample" DOUBLE PRECISION,
  "eloFastSample" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MainModelShadowPrediction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MainModelShadowPrediction_fixture_version_method_key" ON "MainModelShadowPrediction"("fixtureId", "shadowVersion", "method");
CREATE INDEX "MainModelShadowPrediction_shadowVersion_modelContext_kickoff_idx" ON "MainModelShadowPrediction"("shadowVersion", "modelContext", "kickoff");
CREATE INDEX "MainModelShadowPrediction_fixtureId_idx" ON "MainModelShadowPrediction"("fixtureId");

CREATE UNIQUE INDEX "ModelEvaluationSnapshot_scope_key" ON "ModelEvaluationSnapshot"("modelVersion", "modelContext", "contextVersion", "evaluationVersion", "datasetCutoff", "windowType", "leagueId");
CREATE INDEX "ModelEvaluationSnapshot_modelContext_modelVersion_datasetCutoff_idx" ON "ModelEvaluationSnapshot"("modelContext", "modelVersion", "datasetCutoff");
CREATE INDEX "ModelEvaluationSnapshot_leagueId_datasetCutoff_idx" ON "ModelEvaluationSnapshot"("leagueId", "datasetCutoff");
