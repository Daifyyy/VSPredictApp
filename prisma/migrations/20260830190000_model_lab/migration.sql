CREATE TABLE "ModelStrategyDefinition" (
  "id" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "market" TEXT NOT NULL,
  "modelContext" TEXT NOT NULL,
  "modelVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "rules" JSONB NOT NULL,
  "decisionCriteria" JSONB NOT NULL,
  "minimumSample" INTEGER NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelStrategyDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModelStrategyDefinition_strategy_policyVersion_modelContext_modelVersion_key" ON "ModelStrategyDefinition"("strategy", "policyVersion", "modelContext", "modelVersion");
CREATE INDEX "ModelStrategyDefinition_status_modelContext_idx" ON "ModelStrategyDefinition"("status", "modelContext");

CREATE TABLE "ModelStrategyStatusAudit" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "changedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelStrategyStatusAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModelStrategyStatusAudit_definitionId_createdAt_idx" ON "ModelStrategyStatusAudit"("definitionId", "createdAt");
ALTER TABLE "ModelStrategyStatusAudit" ADD CONSTRAINT "ModelStrategyStatusAudit_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ModelStrategyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ModelStrategyReviewReport" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "milestone" INTEGER NOT NULL,
  "datasetFrom" TIMESTAMP(3),
  "datasetTo" TIMESTAMP(3),
  "trainingTo" TIMESTAMP(3),
  "holdoutFrom" TIMESTAMP(3),
  "sampleSize" INTEGER NOT NULL,
  "pricedSample" INTEGER NOT NULL,
  "closingSample" INTEGER NOT NULL,
  "metrics" JSONB NOT NULL,
  "gates" JSONB NOT NULL,
  "recommendation" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelStrategyReviewReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModelStrategyReviewReport_definitionId_milestone_key" ON "ModelStrategyReviewReport"("definitionId", "milestone");
CREATE INDEX "ModelStrategyReviewReport_createdAt_idx" ON "ModelStrategyReviewReport"("createdAt");
ALTER TABLE "ModelStrategyReviewReport" ADD CONSTRAINT "ModelStrategyReviewReport_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ModelStrategyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ModelDegradationIncident" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "windowSize" INTEGER NOT NULL,
  "baselineValue" DOUBLE PRECISION,
  "recentValue" DOUBLE PRECISION,
  "evidence" JSONB NOT NULL,
  "consecutive" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "action" TEXT NOT NULL,
  "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "ModelDegradationIncident_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModelDegradationIncident_definitionId_status_lastDetectedAt_idx" ON "ModelDegradationIncident"("definitionId", "status", "lastDetectedAt");
ALTER TABLE "ModelDegradationIncident" ADD CONSTRAINT "ModelDegradationIncident_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ModelStrategyDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
