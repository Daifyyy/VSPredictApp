CREATE TABLE "CronRun" (
  "id" TEXT NOT NULL,
  "job" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  "candidates" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  "apiCalls" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "remaining" INTEGER NOT NULL DEFAULT 0,
  "cursor" TEXT,
  "reason" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataIncident" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "message" TEXT NOT NULL,
  "details" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "DataIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PipelineCoverage" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "asOf" TIMESTAMP(3) NOT NULL,
  "eligible" INTEGER NOT NULL,
  "covered" INTEGER NOT NULL,
  "ratio" DOUBLE PRECISION NOT NULL,
  "target" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PipelineCoverage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataIncident_fingerprint_key" ON "DataIncident"("fingerprint");
CREATE INDEX "CronRun_job_startedAt_idx" ON "CronRun"("job", "startedAt");
CREATE INDEX "CronRun_status_startedAt_idx" ON "CronRun"("status", "startedAt");
CREATE INDEX "DataIncident_status_severity_lastSeenAt_idx" ON "DataIncident"("status", "severity", "lastSeenAt");
CREATE UNIQUE INDEX "PipelineCoverage_category_asOf_key" ON "PipelineCoverage"("category", "asOf");
CREATE INDEX "PipelineCoverage_category_asOf_idx" ON "PipelineCoverage"("category", "asOf");

ALTER TABLE "FixturePrediction"
  ADD COLUMN "extraTimeHomeGoals" INTEGER,
  ADD COLUMN "extraTimeAwayGoals" INTEGER,
  ADD COLUMN "penaltyHomeGoals" INTEGER,
  ADD COLUMN "penaltyAwayGoals" INTEGER,
  ADD COLUMN "winnerTeamId" INTEGER;
