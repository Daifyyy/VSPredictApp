CREATE TABLE "IntuitionTicket" (
  "id" TEXT NOT NULL,
  "windowKey" TEXT NOT NULL,
  "slot" INTEGER NOT NULL,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'LOCKED',
  "combinedOdds" DOUBLE PRECISION,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL,
  "settledAt" TIMESTAMP(3),
  "hit" BOOLEAN,
  "profit" DOUBLE PRECISION,
  CONSTRAINT "IntuitionTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntuitionTicketLeg" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "fixtureId" INTEGER NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL,
  "homeName" TEXT NOT NULL,
  "awayName" TEXT NOT NULL,
  "winner" TEXT NOT NULL,
  "winnerName" TEXT NOT NULL,
  "totalSide" TEXT NOT NULL,
  "totalLine" DOUBLE PRECISION NOT NULL,
  "role" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "modelProbability" DOUBLE PRECISION NOT NULL,
  "marketWinnerProbability" DOUBLE PRECISION,
  "winnerOdds" DOUBLE PRECISION,
  "decimalOdds" DOUBLE PRECISION,
  "bookmaker" TEXT,
  "reason" TEXT NOT NULL,
  "risk" TEXT NOT NULL,
  "homeGoals" INTEGER,
  "awayGoals" INTEGER,
  "hit" BOOLEAN,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "IntuitionTicketLeg_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntuitionTicket_windowKey_slot_policyVersion_key" ON "IntuitionTicket"("windowKey", "slot", "policyVersion");
CREATE INDEX "IntuitionTicket_status_lockedAt_idx" ON "IntuitionTicket"("status", "lockedAt");
CREATE UNIQUE INDEX "IntuitionTicketLeg_ticketId_fixtureId_key" ON "IntuitionTicketLeg"("ticketId", "fixtureId");
CREATE INDEX "IntuitionTicketLeg_fixtureId_idx" ON "IntuitionTicketLeg"("fixtureId");
ALTER TABLE "IntuitionTicketLeg" ADD CONSTRAINT "IntuitionTicketLeg_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "IntuitionTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
