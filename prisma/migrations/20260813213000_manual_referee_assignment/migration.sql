ALTER TABLE "FixturePrediction"
  ADD COLUMN "refereeSource" TEXT,
  ADD COLUMN "refereeAssignedAt" TIMESTAMP(3),
  ADD COLUMN "refereeAssignedBy" TEXT;

CREATE TABLE "RefereeAssignmentAudit" (
  "id" TEXT NOT NULL,
  "fixtureId" INTEGER NOT NULL,
  "previousName" TEXT,
  "newName" TEXT,
  "previousSource" TEXT,
  "newSource" TEXT NOT NULL,
  "changedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefereeAssignmentAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RefereeAssignmentAudit_fixtureId_createdAt_idx"
  ON "RefereeAssignmentAudit"("fixtureId", "createdAt");
