ALTER TABLE "IntuitionTicket"
ADD COLUMN "naturalCombinedOdds" DOUBLE PRECISION,
ADD COLUMN "estimatedPriceCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "IntuitionTicketLeg"
ADD COLUMN "pedigreeScore" DOUBLE PRECISION,
ADD COLUMN "contextScore" DOUBLE PRECISION,
ADD COLUMN "contextSupports" JSONB,
ADD COLUMN "contextVetoes" JSONB,
ADD COLUMN "pedigreeSnapshotId" TEXT;

ALTER TABLE "ClubEloDivergence" ADD COLUMN "details" JSONB;

CREATE TABLE "ClubPedigreeSnapshot" (
  "id" TEXT NOT NULL,
  "teamId" INTEGER NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "asOfDate" TIMESTAMP(3) NOT NULL,
  "modelVersion" INTEGER NOT NULL,
  "longRating" DOUBLE PRECISION NOT NULL,
  "longSample" DOUBLE PRECISION NOT NULL,
  "eloPercentile" DOUBLE PRECISION NOT NULL,
  "continuity" DOUBLE PRECISION NOT NULL,
  "europeanExperience" DOUBLE PRECISION NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "seasons" INTEGER NOT NULL,
  "leagueMatches" INTEGER NOT NULL,
  "europeanMatches" INTEGER NOT NULL,
  "established" BOOLEAN NOT NULL,
  "calculatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubPedigreeSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClubPedigreeSnapshot_teamId_asOfDate_modelVersion_key" ON "ClubPedigreeSnapshot"("teamId", "asOfDate", "modelVersion");
CREATE INDEX "ClubPedigreeSnapshot_leagueId_asOfDate_idx" ON "ClubPedigreeSnapshot"("leagueId", "asOfDate");
