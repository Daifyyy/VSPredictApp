ALTER TABLE "DirectorAchievement"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'CAREER',
  ADD COLUMN "causalLogIds" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "dayIndex" INTEGER,
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "progress" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "seasonNumber" INTEGER;

ALTER TABLE "DirectorEvent"
  ADD COLUMN "nextDueDay" INTEGER,
  ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'DECISION',
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "storyId" TEXT;

ALTER TABLE "DirectorPulsePost"
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "perspective" TEXT,
  ADD COLUMN "topicId" TEXT;

ALTER TABLE "NotificationPreference"
  ADD COLUMN "directorImportant" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DirectorStory" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "key" TEXT NOT NULL, "pack" TEXT NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'SIGNAL', "status" TEXT NOT NULL DEFAULT 'ACTIVE', "severity" TEXT NOT NULL DEFAULT 'INFO',
  "headline" TEXT NOT NULL, "summary" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT,
  "actorIds" JSONB NOT NULL DEFAULT '[]', "memory" JSONB NOT NULL DEFAULT '[]', "tags" JSONB NOT NULL DEFAULT '[]',
  "openedDay" INTEGER NOT NULL, "nextDueDay" INTEGER, "closedDay" INTEGER, "cooldownUntil" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectorStory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorActor" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "kind" TEXT NOT NULL, "name" TEXT NOT NULL, "organization" TEXT,
  "personality" TEXT NOT NULL, "priorities" JSONB NOT NULL DEFAULT '{}', "alternatives" JSONB NOT NULL DEFAULT '[]',
  "memory" JSONB NOT NULL DEFAULT '[]', "trust" DOUBLE PRECISION NOT NULL DEFAULT 55, "respect" DOUBLE PRECISION NOT NULL DEFAULT 55,
  "influence" DOUBLE PRECISION NOT NULL DEFAULT 50, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectorActor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorMediaAccount" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "kind" TEXT NOT NULL, "name" TEXT NOT NULL, "tone" TEXT NOT NULL,
  "credibility" DOUBLE PRECISION NOT NULL, "reach" INTEGER NOT NULL, "priorities" JSONB NOT NULL DEFAULT '[]',
  "relationships" JSONB NOT NULL DEFAULT '{}', "errorHistory" JSONB NOT NULL DEFAULT '[]', "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectorMediaAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorPulseTopic" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "key" TEXT NOT NULL, "title" TEXT NOT NULL, "sourceType" TEXT NOT NULL,
  "sourceId" TEXT, "relevance" DOUBLE PRECISION NOT NULL DEFAULT 50, "sentiment" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "momentum" DOUBLE PRECISION NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "openedDay" INTEGER NOT NULL,
  "lastPostDay" INTEGER NOT NULL, "closedDay" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DirectorPulseTopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorPublicStatement" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "storyId" TEXT NOT NULL, "tone" TEXT NOT NULL, "audience" TEXT NOT NULL,
  "claim" TEXT NOT NULL, "commitmentMetric" TEXT, "commitmentTarget" DOUBLE PRECISION, "credibilityAtTime" DOUBLE PRECISION NOT NULL,
  "reach" INTEGER NOT NULL, "dayIndex" INTEGER NOT NULL, "outcome" TEXT, "evaluatedDay" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorPublicStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorComplianceTrace" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "storyId" TEXT, "kind" TEXT NOT NULL, "sourceType" TEXT NOT NULL,
  "sourceId" TEXT, "informedActors" JSONB NOT NULL DEFAULT '[]', "evidence" JSONB NOT NULL DEFAULT '[]',
  "exposure" DOUBLE PRECISION NOT NULL DEFAULT 0, "motivation" DOUBLE PRECISION NOT NULL DEFAULT 0, "expiresDay" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'DORMANT', "disclosedDay" INTEGER, "resolvedDay" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectorComplianceTrace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorInvestigation" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "traceId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REVIEW', "openedDay" INTEGER NOT NULL, "dueDay" INTEGER NOT NULL, "response" TEXT,
  "findings" JSONB NOT NULL DEFAULT '[]', "outcome" JSONB NOT NULL DEFAULT '{}', "closedDay" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DirectorInvestigation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorReputationSnapshot" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "dayIndex" INTEGER NOT NULL,
  "sporting" DOUBLE PRECISION NOT NULL, "financial" DOUBLE PRECISION NOT NULL, "people" DOUBLE PRECISION NOT NULL,
  "negotiation" DOUBLE PRECISION NOT NULL, "public" DOUBLE PRECISION NOT NULL, "ethical" DOUBLE PRECISION NOT NULL,
  "overall" DOUBLE PRECISION NOT NULL, "archetypes" JSONB NOT NULL DEFAULT '[]', "drivers" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorReputationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectorNotificationOutbox" (
  "id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "key" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
  "body" TEXT NOT NULL, "url" TEXT NOT NULL DEFAULT '/hra', "importance" INTEGER NOT NULL DEFAULT 2,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3), "attempts" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectorNotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DirectorStory_careerId_status_nextDueDay_idx" ON "DirectorStory"("careerId", "status", "nextDueDay");
CREATE INDEX "DirectorStory_careerId_key_cooldownUntil_idx" ON "DirectorStory"("careerId", "key", "cooldownUntil");
CREATE UNIQUE INDEX "DirectorActor_careerId_kind_name_key" ON "DirectorActor"("careerId", "kind", "name");
CREATE INDEX "DirectorActor_careerId_kind_active_idx" ON "DirectorActor"("careerId", "kind", "active");
CREATE UNIQUE INDEX "DirectorMediaAccount_careerId_kind_name_key" ON "DirectorMediaAccount"("careerId", "kind", "name");
CREATE INDEX "DirectorMediaAccount_careerId_active_idx" ON "DirectorMediaAccount"("careerId", "active");
CREATE UNIQUE INDEX "DirectorPulseTopic_careerId_key_key" ON "DirectorPulseTopic"("careerId", "key");
CREATE INDEX "DirectorPulseTopic_careerId_status_relevance_idx" ON "DirectorPulseTopic"("careerId", "status", "relevance");
CREATE INDEX "DirectorPublicStatement_careerId_dayIndex_idx" ON "DirectorPublicStatement"("careerId", "dayIndex");
CREATE INDEX "DirectorPublicStatement_storyId_idx" ON "DirectorPublicStatement"("storyId");
CREATE INDEX "DirectorComplianceTrace_careerId_status_expiresDay_idx" ON "DirectorComplianceTrace"("careerId", "status", "expiresDay");
CREATE INDEX "DirectorInvestigation_careerId_status_dueDay_idx" ON "DirectorInvestigation"("careerId", "status", "dueDay");
CREATE UNIQUE INDEX "DirectorReputationSnapshot_careerId_dayIndex_key" ON "DirectorReputationSnapshot"("careerId", "dayIndex");
CREATE UNIQUE INDEX "DirectorNotificationOutbox_careerId_key_key" ON "DirectorNotificationOutbox"("careerId", "key");
CREATE INDEX "DirectorNotificationOutbox_status_availableAt_idx" ON "DirectorNotificationOutbox"("status", "availableAt");

ALTER TABLE "DirectorStory" ADD CONSTRAINT "DirectorStory_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorActor" ADD CONSTRAINT "DirectorActor_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorMediaAccount" ADD CONSTRAINT "DirectorMediaAccount_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPulseTopic" ADD CONSTRAINT "DirectorPulseTopic_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPublicStatement" ADD CONSTRAINT "DirectorPublicStatement_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorPublicStatement" ADD CONSTRAINT "DirectorPublicStatement_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "DirectorStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorComplianceTrace" ADD CONSTRAINT "DirectorComplianceTrace_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorComplianceTrace" ADD CONSTRAINT "DirectorComplianceTrace_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "DirectorStory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DirectorInvestigation" ADD CONSTRAINT "DirectorInvestigation_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorInvestigation" ADD CONSTRAINT "DirectorInvestigation_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "DirectorComplianceTrace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorReputationSnapshot" ADD CONSTRAINT "DirectorReputationSnapshot_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorNotificationOutbox" ADD CONSTRAINT "DirectorNotificationOutbox_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorEvent" ADD CONSTRAINT "DirectorEvent_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "DirectorStory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DirectorPulsePost" ADD CONSTRAINT "DirectorPulsePost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "DirectorMediaAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DirectorPulsePost" ADD CONSTRAINT "DirectorPulsePost_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "DirectorPulseTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
