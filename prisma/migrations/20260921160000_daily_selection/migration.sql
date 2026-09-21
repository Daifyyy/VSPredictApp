CREATE TABLE "DailySelectionDay" (
 "id" TEXT NOT NULL PRIMARY KEY, "dateKey" TEXT NOT NULL,
 "policyVersion" INTEGER NOT NULL, "assembledAt" TIMESTAMP(3) NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ASSEMBLED', "emptyReason" TEXT,
 "summary" JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX "DailySelectionDay_dateKey_key" ON "DailySelectionDay"("dateKey");
CREATE TABLE "DailySelectionItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "dayId" TEXT NOT NULL,
 "rank" INTEGER NOT NULL CHECK ("rank" BETWEEN 1 AND 5),
 "fixtureId" INTEGER NOT NULL, "leagueId" INTEGER NOT NULL, "kickoff" TIMESTAMP(3) NOT NULL,
 "marketKey" TEXT NOT NULL, "cohortKey" TEXT NOT NULL, "tier" TEXT NOT NULL,
 "decimalOdds" DOUBLE PRECISION NOT NULL CHECK ("decimalOdds" BETWEEN 1.5 AND 3),
 "bookmaker" TEXT NOT NULL, "quotedAt" TIMESTAMP(3) NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL,
 "snapshot" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "outcome" TEXT NOT NULL DEFAULT 'PENDING',
 "profit" DOUBLE PRECISION, "settledAt" TIMESTAMP(3), "priceClv" DOUBLE PRECISION, "closingAudit" JSONB,
 CONSTRAINT "DailySelectionItem_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "DailySelectionDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DailySelectionItem_dayId_rank_key" ON "DailySelectionItem"("dayId", "rank");
CREATE UNIQUE INDEX "DailySelectionItem_dayId_fixtureId_key" ON "DailySelectionItem"("dayId", "fixtureId");
CREATE INDEX "DailySelectionItem_outcome_kickoff_idx" ON "DailySelectionItem"("outcome", "kickoff");
CREATE INDEX "DailySelectionItem_cohortKey_publishedAt_idx" ON "DailySelectionItem"("cohortKey", "publishedAt");
CREATE TABLE "DailySelectionEvent" (
 "id" TEXT NOT NULL PRIMARY KEY, "eventKey" TEXT NOT NULL, "dayId" TEXT NOT NULL, "itemId" TEXT,
 "kind" TEXT NOT NULL, "payload" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DailySelectionEvent_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "DailySelectionDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "DailySelectionEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DailySelectionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DailySelectionEvent_eventKey_key" ON "DailySelectionEvent"("eventKey");
CREATE INDEX "DailySelectionEvent_dayId_createdAt_idx" ON "DailySelectionEvent"("dayId", "createdAt");
