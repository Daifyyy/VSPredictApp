CREATE TABLE "MatchFlowEvaluationSnapshot" (
  "id" TEXT NOT NULL,
  "fixtureId" INTEGER NOT NULL,
  "leagueId" INTEGER NOT NULL,
  "kickoff" TIMESTAMP(3) NOT NULL,
  "pressureVersion" INTEGER NOT NULL,
  "evaluationVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "verdict" TEXT,
  "coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "structurallyChanged" BOOLEAN NOT NULL DEFAULT false,
  "expectation" JSONB NOT NULL,
  "halftime" JSONB,
  "actual" JSONB,
  "evaluation" JSONB,
  "evaluatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchFlowEvaluationSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MatchFlowEvaluationSnapshot_fixtureId_pressureVersion_evaluationVersion_key" ON "MatchFlowEvaluationSnapshot"("fixtureId", "pressureVersion", "evaluationVersion");
CREATE INDEX "MatchFlowEvaluationSnapshot_pressureVersion_evaluationVersion_status_idx" ON "MatchFlowEvaluationSnapshot"("pressureVersion", "evaluationVersion", "status");
CREATE INDEX "MatchFlowEvaluationSnapshot_leagueId_kickoff_idx" ON "MatchFlowEvaluationSnapshot"("leagueId", "kickoff");
