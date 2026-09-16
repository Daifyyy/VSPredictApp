ALTER TABLE "MatchFlowEvaluationSnapshot"
ADD COLUMN "diagnosisCode" TEXT;

CREATE INDEX "MatchFlowEvaluationSnapshot_evaluationVersion_status_diagnosisCode_idx"
ON "MatchFlowEvaluationSnapshot"("evaluationVersion", "status", "diagnosisCode");
