export const MODEL_FORECAST_SORTS = {
  probability_desc: 'Pravděpodobnost ↓',
  probability_asc: 'Pravděpodobnost ↑',
  kickoff: 'Čas výkopu',
} as const;
export type ModelForecastSort = keyof typeof MODEL_FORECAST_SORTS;
export function modelForecastOrder(sort: ModelForecastSort) {
  return sort === 'kickoff'
    ? [{ kickoff: 'asc' as const }, { id: 'asc' as const }]
    : [{ probability: sort === 'probability_asc' ? 'asc' as const : 'desc' as const }, { kickoff: 'asc' as const }, { id: 'asc' as const }];
}
