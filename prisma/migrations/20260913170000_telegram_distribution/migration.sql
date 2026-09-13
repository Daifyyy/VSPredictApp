CREATE TABLE "TelegramPublication" (
  "id" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "policyVersions" JSONB NOT NULL,
  "payload" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "messageIds" JSONB NOT NULL DEFAULT '[]',
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramPublication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelegramPublication_dateKey_channelId_kind_key" ON "TelegramPublication"("dateKey", "channelId", "kind");
CREATE INDEX "TelegramPublication_status_updatedAt_idx" ON "TelegramPublication"("status", "updatedAt");

CREATE TABLE "TelegramCommandCursor" (
  "userId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "strategy" TEXT NOT NULL,
  "offset" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCommandCursor_pkey" PRIMARY KEY ("userId", "dateKey", "strategy")
);
CREATE INDEX "TelegramCommandCursor_updatedAt_idx" ON "TelegramCommandCursor"("updatedAt");

CREATE TABLE "TelegramUpdateReceipt" (
  "updateId" BIGINT NOT NULL,
  "userId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "payload" JSONB NOT NULL DEFAULT '[]',
  "messageIds" JSONB NOT NULL DEFAULT '[]',
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramUpdateReceipt_pkey" PRIMARY KEY ("updateId")
);
CREATE INDEX "TelegramUpdateReceipt_status_updatedAt_idx" ON "TelegramUpdateReceipt"("status", "updatedAt");
