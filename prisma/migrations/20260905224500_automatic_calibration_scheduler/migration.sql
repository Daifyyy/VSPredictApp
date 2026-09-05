CREATE TABLE "CalibrationCheckpoint" (
  "id" TEXT NOT NULL,
  "cohort" TEXT NOT NULL DEFAULT 'GOALS',
  "modelContext" TEXT NOT NULL,
  "sourceModelVersion" INTEGER NOT NULL,
  "evaluatedCount" INTEGER NOT NULL DEFAULT 0,
  "pendingCount" INTEGER NOT NULL DEFAULT 0,
  "datasetCutoff" TIMESTAMP(3),
  "datasetHash" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalibrationCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalibrationEvaluationBatch" (
  "id" TEXT NOT NULL,
  "checkpointId" TEXT NOT NULL,
  "cohort" TEXT NOT NULL,
  "modelContext" TEXT NOT NULL,
  "sourceModelVersion" INTEGER NOT NULL,
  "datasetCutoff" TIMESTAMP(3) NOT NULL,
  "datasetHash" TEXT NOT NULL,
  "sampleSize" INTEGER NOT NULL,
  "newResults" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "summary" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalibrationEvaluationBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalibrationCheckpoint_scope_key" ON "CalibrationCheckpoint"("cohort", "modelContext", "sourceModelVersion");
CREATE INDEX "CalibrationCheckpoint_lastRunAt_idx" ON "CalibrationCheckpoint"("lastRunAt");
CREATE UNIQUE INDEX "CalibrationEvaluationBatch_dataset_key" ON "CalibrationEvaluationBatch"("cohort", "modelContext", "sourceModelVersion", "datasetHash");
CREATE INDEX "CalibrationEvaluationBatch_status_startedAt_idx" ON "CalibrationEvaluationBatch"("status", "startedAt");
ALTER TABLE "CalibrationEvaluationBatch" ADD CONSTRAINT "CalibrationEvaluationBatch_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "CalibrationCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
