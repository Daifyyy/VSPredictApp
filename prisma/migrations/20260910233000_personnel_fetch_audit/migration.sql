CREATE TABLE "PersonnelFetchAttempt" (
  "id" TEXT NOT NULL,
  "attemptKey" TEXT NOT NULL,
  "dataType" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "fixtureId" INTEGER,
  "leagueId" INTEGER,
  "teamId" INTEGER,
  "season" INTEGER,
  "rowCount" INTEGER,
  "durationMs" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "details" JSONB,
  "attemptedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonnelFetchAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PersonnelFetchAttempt_attemptKey_key" ON "PersonnelFetchAttempt"("attemptKey");
CREATE INDEX "PersonnelFetchAttempt_dataType_status_attemptedAt_idx" ON "PersonnelFetchAttempt"("dataType", "status", "attemptedAt");
CREATE INDEX "PersonnelFetchAttempt_fixtureId_dataType_attemptedAt_idx" ON "PersonnelFetchAttempt"("fixtureId", "dataType", "attemptedAt");
CREATE INDEX "PersonnelFetchAttempt_teamId_season_dataType_attemptedAt_idx" ON "PersonnelFetchAttempt"("teamId", "season", "dataType", "attemptedAt");
