ALTER TABLE "FixturePrediction"
  ADD COLUMN "oddsCurrentBooks" JSONB,
  ADD COLUMN "oddsCurrentAt" TIMESTAMP(3);
