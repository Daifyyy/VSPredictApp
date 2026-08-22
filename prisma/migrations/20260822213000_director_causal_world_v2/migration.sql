DROP INDEX IF EXISTS "DirectorMatch_careerId_round_key";
CREATE UNIQUE INDEX "DirectorMatch_careerId_round_homeClubId_awayClubId_key" ON "DirectorMatch"("careerId", "round", "homeClubId", "awayClubId");

CREATE TABLE "DirectorCausalEffect" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT,
  "sourceLabel" TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetId" TEXT, "metric" TEXT NOT NULL,
  "direction" TEXT NOT NULL, "magnitude" DOUBLE PRECISION NOT NULL, "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "startDay" INTEGER NOT NULL, "endDay" INTEGER, "decay" TEXT NOT NULL DEFAULT 'LINEAR', "condition" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE', "applied" DOUBLE PRECISION NOT NULL DEFAULT 0, "explanation" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectorCausalEffect_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DirectorCommitment" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "sourceEventId" TEXT, "stakeholderType" TEXT NOT NULL,
  "stakeholderId" TEXT, "title" TEXT NOT NULL, "metric" TEXT NOT NULL, "target" DOUBLE PRECISION NOT NULL,
  "tolerance" DOUBLE PRECISION NOT NULL DEFAULT 0, "baseline" DOUBLE PRECISION, "dueDay" INTEGER NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM', "status" TEXT NOT NULL DEFAULT 'TRACKING', "progress" DOUBLE PRECISION,
  "explanation" TEXT NOT NULL, "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DirectorCommitment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DirectorRelationship" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "actorType" TEXT NOT NULL, "actorId" TEXT, "actorName" TEXT NOT NULL,
  "trust" DOUBLE PRECISION NOT NULL DEFAULT 60, "respect" DOUBLE PRECISION NOT NULL DEFAULT 60,
  "alignment" DOUBLE PRECISION NOT NULL DEFAULT 50, "conflicts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "credibility" DOUBLE PRECISION NOT NULL DEFAULT 60, "priorities" JSONB NOT NULL DEFAULT '{}', "memory" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectorRelationship_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DirectorLedgerEntry" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "dayIndex" INTEGER NOT NULL,
  "category" TEXT NOT NULL, "direction" TEXT NOT NULL, "amount" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'POSTED',
  "dueDay" INTEGER, "sourceType" TEXT NOT NULL, "sourceId" TEXT, "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DirectorSeason" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "number" INTEGER NOT NULL DEFAULT 1, "startDay" INTEGER NOT NULL DEFAULT 0,
  "endDay" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "currentRound" INTEGER NOT NULL DEFAULT 0,
  "rules" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "DirectorSeason_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DirectorStanding" (
  "id" TEXT NOT NULL, "seasonId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "played" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0, "draws" INTEGER NOT NULL DEFAULT 0, "losses" INTEGER NOT NULL DEFAULT 0,
  "goalsFor" INTEGER NOT NULL DEFAULT 0, "goalsAgainst" INTEGER NOT NULL DEFAULT 0, "points" INTEGER NOT NULL DEFAULT 0,
  "expectedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0, "performance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DirectorStanding_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DirectorClubNeed" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "kind" TEXT NOT NULL, "target" TEXT NOT NULL,
  "urgency" DOUBLE PRECISION NOT NULL, "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN',
  "lastEvaluatedDay" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectorClubNeed_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DirectorCausalLog" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "dayIndex" INTEGER NOT NULL, "sourceType" TEXT NOT NULL,
  "sourceId" TEXT, "effectId" TEXT, "category" TEXT NOT NULL, "headline" TEXT NOT NULL, "explanation" TEXT NOT NULL,
  "targetType" TEXT, "targetId" TEXT, "importance" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorCausalLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DirectorCausalEffect_careerId_status_startDay_idx" ON "DirectorCausalEffect"("careerId", "status", "startDay");
CREATE INDEX "DirectorCausalEffect_careerId_targetType_targetId_idx" ON "DirectorCausalEffect"("careerId", "targetType", "targetId");
CREATE INDEX "DirectorCommitment_careerId_status_dueDay_idx" ON "DirectorCommitment"("careerId", "status", "dueDay");
CREATE UNIQUE INDEX "DirectorRelationship_careerId_actorType_actorName_key" ON "DirectorRelationship"("careerId", "actorType", "actorName");
CREATE INDEX "DirectorRelationship_careerId_actorType_idx" ON "DirectorRelationship"("careerId", "actorType");
CREATE INDEX "DirectorLedgerEntry_careerId_clubId_dayIndex_idx" ON "DirectorLedgerEntry"("careerId", "clubId", "dayIndex");
CREATE INDEX "DirectorLedgerEntry_careerId_status_dueDay_idx" ON "DirectorLedgerEntry"("careerId", "status", "dueDay");
CREATE UNIQUE INDEX "DirectorSeason_careerId_number_key" ON "DirectorSeason"("careerId", "number");
CREATE UNIQUE INDEX "DirectorStanding_seasonId_clubId_key" ON "DirectorStanding"("seasonId", "clubId");
CREATE INDEX "DirectorStanding_seasonId_points_idx" ON "DirectorStanding"("seasonId", "points");
CREATE UNIQUE INDEX "DirectorClubNeed_careerId_clubId_kind_target_key" ON "DirectorClubNeed"("careerId", "clubId", "kind", "target");
CREATE INDEX "DirectorClubNeed_careerId_status_urgency_idx" ON "DirectorClubNeed"("careerId", "status", "urgency");
CREATE INDEX "DirectorCausalLog_careerId_dayIndex_importance_idx" ON "DirectorCausalLog"("careerId", "dayIndex", "importance");
CREATE INDEX "DirectorCausalLog_careerId_sourceType_sourceId_idx" ON "DirectorCausalLog"("careerId", "sourceType", "sourceId");

ALTER TABLE "DirectorCausalEffect" ADD CONSTRAINT "DirectorCausalEffect_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorCommitment" ADD CONSTRAINT "DirectorCommitment_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorRelationship" ADD CONSTRAINT "DirectorRelationship_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorLedgerEntry" ADD CONSTRAINT "DirectorLedgerEntry_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorSeason" ADD CONSTRAINT "DirectorSeason_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorStanding" ADD CONSTRAINT "DirectorStanding_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "DirectorSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorStanding" ADD CONSTRAINT "DirectorStanding_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "DirectorClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorClubNeed" ADD CONSTRAINT "DirectorClubNeed_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorCausalLog" ADD CONSTRAINT "DirectorCausalLog_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
