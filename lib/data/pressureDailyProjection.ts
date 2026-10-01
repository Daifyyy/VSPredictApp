import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { PerformancePressureShadowV5 } from '../picks/performancePressureShadowV5';

type Shape = PerformancePressureShadowV5['expectedMatchShape'];
type Side = Pick<Shape['home'], 'shots' | 'chanceShare'>;
export type PressureDailyRow = {
  fixtureId: number; leagueId: number; kickoff: Date; homeName: string; awayName: string;
  pressure: Pick<PerformancePressureShadowV5, 'version' | 'goalLambda' | 'marketProbabilities' | 'featureCoverage' | 'fallbacks'> & {
    expectedMatchShape: { home: Side; away: Side; opennessLabel: Shape['opennessLabel'] };
  };
};

/** List projection only. Never transfers training inputs, odds history or technical diagnostics. */
export function pressureDailyProjectionQuery(start: Date, end: Date) {
  return Prisma.sql`
    SELECT "fixtureId", "leagueId", "kickoff", "homeName", "awayName",
      jsonb_build_object(
        'version', 5,
        'goalLambda', "inputSnapshot" #> '{performancePressure,goalLambda}',
        'marketProbabilities', "inputSnapshot" #> '{performancePressure,marketProbabilities}',
        'featureCoverage', "inputSnapshot" #> '{performancePressure,featureCoverage}',
        'fallbacks', "inputSnapshot" #> '{performancePressure,fallbacks}',
        'expectedMatchShape', jsonb_build_object(
          'opennessLabel', "inputSnapshot" #> '{performancePressure,expectedMatchShape,opennessLabel}',
          'home', jsonb_build_object(
            'shots', "inputSnapshot" #> '{performancePressure,expectedMatchShape,home,shots}',
            'chanceShare', "inputSnapshot" #> '{performancePressure,expectedMatchShape,home,chanceShare}'),
          'away', jsonb_build_object(
            'shots', "inputSnapshot" #> '{performancePressure,expectedMatchShape,away,shots}',
            'chanceShare', "inputSnapshot" #> '{performancePressure,expectedMatchShape,away,chanceShare}')
        )
      ) AS pressure
    FROM "FixturePrediction"
    WHERE "modelContext" = 'LEAGUE' AND "kickoff" >= ${start} AND "kickoff" < ${end}
      AND "inputSnapshot" #> '{performancePressure,version}' = '5'::jsonb
    ORDER BY "kickoff" ASC, "fixtureId" ASC
  `;
}

export async function loadPressureDailyProjection(start: Date, end: Date) {
  return prisma.$queryRaw<PressureDailyRow[]>(pressureDailyProjectionQuery(start, end));
}
