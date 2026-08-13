ALTER TABLE "FixturePrediction"
ADD COLUMN "countModelVersion" INTEGER,
ADD COLUMN "cornerVarianceRatio" DOUBLE PRECISION,
ADD COLUMN "cardVarianceRatio" DOUBLE PRECISION;

UPDATE "FixturePrediction"
SET
  "countModelVersion" = 0,
  "cornerVarianceRatio" = CASE WHEN "lambdaCornersHome" IS NOT NULL AND "lambdaCornersAway" IS NOT NULL THEN 1.2 ELSE NULL END,
  "cardVarianceRatio" = CASE WHEN "lambdaCardsHome" IS NOT NULL AND "lambdaCardsAway" IS NOT NULL THEN 1.2 ELSE NULL END
WHERE
  ("lambdaCornersHome" IS NOT NULL AND "lambdaCornersAway" IS NOT NULL)
  OR ("lambdaCardsHome" IS NOT NULL AND "lambdaCardsAway" IS NOT NULL);
