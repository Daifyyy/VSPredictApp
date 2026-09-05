ALTER TABLE "MarketSignalSnapshot"
ADD COLUMN "decimalOdds" DOUBLE PRECISION,
ADD COLUMN "bookmaker" TEXT,
ADD COLUMN "quotedAt" TIMESTAMP(3),
ADD COLUMN "referenceOverround" DOUBLE PRECISION;

CREATE INDEX "MarketSignalSnapshot_modelContext_market_openedAt_idx"
ON "MarketSignalSnapshot"("modelContext", "market", "openedAt");

CREATE TABLE "ModelStrategyMetricSnapshot" (
  "id" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "modelContext" TEXT NOT NULL,
  "modelVersion" INTEGER NOT NULL,
  "datasetCutoff" TIMESTAMP(3) NOT NULL,
  "sampleSize" INTEGER NOT NULL,
  "currentCount" INTEGER NOT NULL DEFAULT 0,
  "metrics" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelStrategyMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelStrategyMetricSnapshot_scope_cutoff_key"
ON "ModelStrategyMetricSnapshot"("strategy", "policyVersion", "modelContext", "modelVersion", "datasetCutoff");

CREATE INDEX "ModelStrategyMetricSnapshot_modelContext_createdAt_idx"
ON "ModelStrategyMetricSnapshot"("modelContext", "createdAt");

CREATE INDEX "ModelStrategyMetricSnapshot_scope_createdAt_idx"
ON "ModelStrategyMetricSnapshot"("strategy", "policyVersion", "modelContext", "createdAt");
