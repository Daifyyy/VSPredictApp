ALTER TABLE "NotificationPreference"
ADD COLUMN "publishedPrediction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marketMovement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "movementThreshold" INTEGER NOT NULL DEFAULT 3;
