CREATE TABLE "CalibrationDefinition" (
  "id" TEXT NOT NULL,
  "market" TEXT NOT NULL,
  "modelContext" TEXT NOT NULL,
  "sourceModelVersion" INTEGER NOT NULL,
  "calibrationVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "parameters" JSONB NOT NULL,
  "datasetFrom" TIMESTAMP(3),
  "datasetTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "CalibrationDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalibrationReviewReport" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "datasetCutoff" TIMESTAMP(3) NOT NULL,
  "sampleSize" INTEGER NOT NULL,
  "foldCount" INTEGER NOT NULL,
  "metrics" JSONB NOT NULL,
  "gates" JSONB NOT NULL,
  "recommendation" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalibrationReviewReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalibrationShadowPrediction" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "fixtureId" INTEGER NOT NULL,
  "sourcePredictedAt" TIMESTAMP(3) NOT NULL,
  "probabilities" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalibrationShadowPrediction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalibrationDefinition_scope_version_key" ON "CalibrationDefinition"("market", "modelContext", "sourceModelVersion", "calibrationVersion");
CREATE INDEX "CalibrationDefinition_active_idx" ON "CalibrationDefinition"("status", "modelContext", "sourceModelVersion");
CREATE UNIQUE INDEX "CalibrationReviewReport_definition_cutoff_key" ON "CalibrationReviewReport"("definitionId", "datasetCutoff");
CREATE INDEX "CalibrationReviewReport_createdAt_idx" ON "CalibrationReviewReport"("createdAt");
CREATE UNIQUE INDEX "CalibrationShadowPrediction_definition_fixture_key" ON "CalibrationShadowPrediction"("definitionId", "fixtureId");
CREATE INDEX "CalibrationShadowPrediction_fixtureId_idx" ON "CalibrationShadowPrediction"("fixtureId");

ALTER TABLE "CalibrationReviewReport" ADD CONSTRAINT "CalibrationReviewReport_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CalibrationDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalibrationShadowPrediction" ADD CONSTRAINT "CalibrationShadowPrediction_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CalibrationDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
