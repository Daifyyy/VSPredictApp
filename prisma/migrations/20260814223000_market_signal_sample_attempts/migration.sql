ALTER TABLE "MarketSignalSnapshot"
ADD COLUMN "sampleAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastSampleAttemptAt" TIMESTAMP(3);
