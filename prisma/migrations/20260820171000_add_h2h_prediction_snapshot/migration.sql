ALTER TABLE "FixturePrediction"
ADD COLUMN "h2hSnapshot" JSONB,
ADD COLUMN "h2hSnapshotVersion" INTEGER,
ADD COLUMN "h2hCapturedAt" TIMESTAMP(3);
