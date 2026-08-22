ALTER TABLE "DirectorClub"
  ADD COLUMN "simulationMode" TEXT NOT NULL DEFAULT 'DETAIL',
  ADD COLUMN "competitionName" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "reputation" DOUBLE PRECISION NOT NULL DEFAULT 50,
  ADD COLUMN "marketProfile" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "reservedCash" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DirectorPlayer"
  ADD COLUMN "owningClubId" TEXT,
  ADD COLUMN "loanParentClubId" TEXT,
  ADD COLUMN "loanEndDay" INTEGER,
  ADD COLUMN "adaptation" DOUBLE PRECISION NOT NULL DEFAULT 70,
  ADD COLUMN "languageGroup" TEXT NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "marketInterest" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "DirectorClubNeed"
  ADD COLUMN "desiredRole" TEXT,
  ADD COLUMN "minAge" INTEGER,
  ADD COLUMN "maxAge" INTEGER,
  ADD COLUMN "budgetMin" INTEGER,
  ADD COLUMN "budgetMax" INTEGER,
  ADD COLUMN "tacticalFit" DOUBLE PRECISION NOT NULL DEFAULT 50;

ALTER TABLE "DirectorTransferCase"
  ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'CLUB',
  ADD COLUMN "patience" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "deadlineDay" INTEGER,
  ADD COLUMN "reservedAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failureReason" TEXT;

ALTER TABLE "DirectorTransferOffer"
  ADD COLUMN "optionMandatory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wageShare" DOUBLE PRECISION NOT NULL DEFAULT 1;

CREATE TABLE "DirectorContractNegotiation" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN', "round" INTEGER NOT NULL DEFAULT 0, "patience" INTEGER NOT NULL DEFAULT 3, "deadlineDay" INTEGER NOT NULL, "agentPosition" JSONB NOT NULL DEFAULT '{}', "failureReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DirectorContractNegotiation_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorContractNegotiation_caseId_key" ON "DirectorContractNegotiation"("caseId");
CREATE INDEX "DirectorContractNegotiation_careerId_status_deadlineDay_idx" ON "DirectorContractNegotiation"("careerId", "status", "deadlineDay");
CREATE INDEX "DirectorContractNegotiation_playerId_status_idx" ON "DirectorContractNegotiation"("playerId", "status");

CREATE TABLE "DirectorContractOffer" ("id" TEXT NOT NULL, "negotiationId" TEXT NOT NULL, "round" INTEGER NOT NULL, "weeklyWage" INTEGER NOT NULL, "years" INTEGER NOT NULL, "signingBonus" INTEGER NOT NULL DEFAULT 0, "appearanceBonus" INTEGER NOT NULL DEFAULT 0, "goalBonus" INTEGER NOT NULL DEFAULT 0, "releaseClause" INTEGER, "promisedRole" TEXT NOT NULL, "promisedShare" DOUBLE PRECISION NOT NULL, "agentFee" INTEGER NOT NULL DEFAULT 0, "playerUtility" DOUBLE PRECISION NOT NULL, "response" TEXT NOT NULL, "accepted" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorContractOffer_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorContractOffer_negotiationId_round_key" ON "DirectorContractOffer"("negotiationId", "round");

CREATE TABLE "DirectorCompetingBid" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "bidderClubId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "upfront" INTEGER NOT NULL, "guaranteed" INTEGER NOT NULL, "playerUtility" DOUBLE PRECISION NOT NULL, "expiresDay" INTEGER NOT NULL, "createdDay" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorCompetingBid_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorCompetingBid_caseId_bidderClubId_key" ON "DirectorCompetingBid"("caseId", "bidderClubId");
CREATE INDEX "DirectorCompetingBid_careerId_status_expiresDay_idx" ON "DirectorCompetingBid"("careerId", "status", "expiresDay");

CREATE TABLE "DirectorTransferPayment" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "payerClubId" TEXT NOT NULL, "payeeClubId" TEXT NOT NULL, "kind" TEXT NOT NULL, "amount" INTEGER NOT NULL, "dueDay" INTEGER, "condition" JSONB, "status" TEXT NOT NULL DEFAULT 'PENDING', "paidDay" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorTransferPayment_pkey" PRIMARY KEY ("id"));
CREATE INDEX "DirectorTransferPayment_careerId_status_dueDay_idx" ON "DirectorTransferPayment"("careerId", "status", "dueDay");
CREATE INDEX "DirectorTransferPayment_caseId_kind_idx" ON "DirectorTransferPayment"("caseId", "kind");

CREATE TABLE "DirectorTransferClause" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "beneficiaryClubId" TEXT NOT NULL, "kind" TEXT NOT NULL, "value" DOUBLE PRECISION NOT NULL, "condition" JSONB NOT NULL DEFAULT '{}', "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorTransferClause_pkey" PRIMARY KEY ("id"));
CREATE INDEX "DirectorTransferClause_careerId_playerId_status_idx" ON "DirectorTransferClause"("careerId", "playerId", "status");

CREATE TABLE "DirectorScoutingReport" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "requestingClubId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "dayIndex" INTEGER NOT NULL, "version" INTEGER NOT NULL DEFAULT 1, "abilityMin" DOUBLE PRECISION NOT NULL, "abilityMax" DOUBLE PRECISION NOT NULL, "potentialMin" DOUBLE PRECISION NOT NULL, "potentialMax" DOUBLE PRECISION NOT NULL, "valueMin" INTEGER NOT NULL, "valueMax" INTEGER NOT NULL, "wageMin" INTEGER NOT NULL, "wageMax" INTEGER NOT NULL, "tacticalFit" DOUBLE PRECISION NOT NULL, "personalityConfidence" DOUBLE PRECISION NOT NULL, "completeness" DOUBLE PRECISION NOT NULL, "expiresDay" INTEGER NOT NULL, "explanation" JSONB NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DirectorScoutingReport_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorScoutingReport_careerId_requestingClubId_playerId_version_key" ON "DirectorScoutingReport"("careerId", "requestingClubId", "playerId", "version");
CREATE INDEX "DirectorScoutingReport_careerId_requestingClubId_expiresDay_idx" ON "DirectorScoutingReport"("careerId", "requestingClubId", "expiresDay");

CREATE TABLE "DirectorShortlistEntry" ("id" TEXT NOT NULL, "careerId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "playerId" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 2, "status" TEXT NOT NULL DEFAULT 'WATCHING', "note" TEXT, "lastAlert" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DirectorShortlistEntry_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DirectorShortlistEntry_careerId_clubId_playerId_key" ON "DirectorShortlistEntry"("careerId", "clubId", "playerId");
CREATE INDEX "DirectorShortlistEntry_careerId_clubId_priority_idx" ON "DirectorShortlistEntry"("careerId", "clubId", "priority");

ALTER TABLE "DirectorContractNegotiation" ADD CONSTRAINT "DirectorContractNegotiation_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorContractNegotiation" ADD CONSTRAINT "DirectorContractNegotiation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DirectorTransferCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorContractOffer" ADD CONSTRAINT "DirectorContractOffer_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "DirectorContractNegotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorCompetingBid" ADD CONSTRAINT "DirectorCompetingBid_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorCompetingBid" ADD CONSTRAINT "DirectorCompetingBid_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DirectorTransferCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorTransferPayment" ADD CONSTRAINT "DirectorTransferPayment_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorTransferPayment" ADD CONSTRAINT "DirectorTransferPayment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DirectorTransferCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorTransferClause" ADD CONSTRAINT "DirectorTransferClause_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorTransferClause" ADD CONSTRAINT "DirectorTransferClause_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DirectorTransferCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorScoutingReport" ADD CONSTRAINT "DirectorScoutingReport_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectorShortlistEntry" ADD CONSTRAINT "DirectorShortlistEntry_careerId_fkey" FOREIGN KEY ("careerId") REFERENCES "DirectorCareer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "DirectorPlayer" SET "owningClubId" = "clubId" WHERE "owningClubId" IS NULL;
UPDATE "DirectorTransferCase" SET "stage" = CASE WHEN "status" = 'AGREED' THEN 'REGISTRATION' WHEN "status" IN ('COMPLETED', 'REJECTED') THEN 'CLOSED' ELSE 'CLUB' END;
