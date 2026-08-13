ALTER TABLE "FixturePrediction"
ADD COLUMN "published1x2Side" TEXT,
ADD COLUMN "published1x2Prob" DOUBLE PRECISION,
ADD COLUMN "publicationPolicyVersion" INTEGER,
ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Záměrně žádný backfill: stará prognóza nebyla před zápasem publikovaným tipem.
