ALTER TABLE "AutonomousTipSnapshot"
  ADD COLUMN "countModelVersion" INTEGER,
  ADD COLUMN "referenceOverround" DOUBLE PRECISION,
  ADD COLUMN "settlementStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "actualCount" INTEGER,
  ADD COLUMN "hit" BOOLEAN,
  ADD COLUMN "profit" DOUBLE PRECISION,
  ADD COLUMN "settledAt" TIMESTAMP(3);

CREATE INDEX "AutonomousTipSnapshot_settledAt_idx"
  ON "AutonomousTipSnapshot"("settledAt");
