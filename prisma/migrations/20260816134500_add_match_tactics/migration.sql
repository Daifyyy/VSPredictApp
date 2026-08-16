ALTER TABLE "MatchStatCache"
ADD COLUMN "formation" TEXT,
ADD COLUMN "coachId" INTEGER,
ADD COLUMN "coachName" TEXT,
ADD COLUMN "coachPhoto" TEXT,
ADD COLUMN "lineupCheckedAt" TIMESTAMP(3);
