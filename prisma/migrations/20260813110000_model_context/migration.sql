ALTER TABLE "FixturePrediction"
ADD COLUMN "modelContext" TEXT NOT NULL DEFAULT 'LEAGUE',
ADD COLUMN "contextVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "FixturePrediction"
SET "modelContext" = CASE
  WHEN "leagueId" IN (2, 3, 848) THEN 'EURO_CUP'
  WHEN "leagueId" IN (1, 4, 5, 6, 7, 9, 22, 536) THEN 'NATIONAL'
  ELSE 'LEAGUE'
END;

-- Starší evropské predikce vznikly před vynucením pohárového zdroje. Zůstanou
-- auditovatelné jako verze 1; nová produkční Evropa začíná na verzi 2.
CREATE INDEX "FixturePrediction_modelContext_contextVersion_modelVersion_idx"
ON "FixturePrediction"("modelContext", "contextVersion", "modelVersion");
