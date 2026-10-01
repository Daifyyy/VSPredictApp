export const RESOURCE_METRICS = {
  'neon.transfer': 'GB', 'neon.compute': 'CU_HOURS', 'neon.storage': 'GB',
  'vercel.cpu': 'HOURS', 'vercel.memory': 'GB_HOURS', 'vercel.invocations': 'COUNT',
  'vercel.transfer': 'GB', 'vercel.cacheReads': 'COUNT', 'vercel.cacheWrites': 'COUNT',
  'vercel.functionsStorage': 'GB', 'vercel.deploymentStorage': 'GB',
  'github.minutes': 'MINUTES', 'github.artifacts': 'GB', 'github.cache': 'GB',
  'apiFootball.daily': 'COUNT', 'apiFootball.minute': 'COUNT',
} as const;
export type ResourceMetric = keyof typeof RESOURCE_METRICS;
export interface ResourceBudgetSnapshot {
  metric: ResourceMetric;
  unit: string;
  periodStart: string;
  periodEnd: string;
  measuredAt: string;
  used: number;
  limit: number;
  projected: number | null;
  source: 'PROVIDER' | 'MANUAL' | 'ESTIMATE';
}
export type BudgetMode = 'NORMAL' | 'SAVING' | 'CRITICAL' | 'STOP' | 'UNKNOWN';
export function validResourceSnapshot(value: unknown, now = new Date()): value is ResourceBudgetSnapshot {
  if (!value || typeof value !== 'object') return false;
  const r = value as ResourceBudgetSnapshot;
  const start = Date.parse(r.periodStart), end = Date.parse(r.periodEnd), measured = Date.parse(r.measuredAt);
  return Object.hasOwn(RESOURCE_METRICS, r.metric) && r.unit === RESOURCE_METRICS[r.metric]
    && [start,end,measured].every(Number.isFinite) && start <= measured && measured < end && measured <= now.getTime()
    && end > start && Number.isFinite(r.used) && r.used >= 0 && Number.isFinite(r.limit) && r.limit > 0
    && (r.projected === null || Number.isFinite(r.projected) && r.projected >= r.used)
    && ['PROVIDER','MANUAL','ESTIMATE'].includes(r.source);
}
export function evaluateResourceBudget(rows: ResourceBudgetSnapshot[], now = new Date()) {
  const current = new Map<ResourceMetric, ResourceBudgetSnapshot>();
  for (const row of rows) {
    if (!validResourceSnapshot(row, now) || Date.parse(row.periodStart) > +now || Date.parse(row.periodEnd) <= +now) continue;
    const old = current.get(row.metric);
    if (!old || Date.parse(row.measuredAt) > Date.parse(old.measuredAt)) current.set(row.metric, row);
  }
  const missing = (Object.keys(RESOURCE_METRICS) as ResourceMetric[]).filter(key => !current.has(key));
  const stale = [...current.values()].filter(r => +now - Date.parse(r.measuredAt) > 48 * 3600_000 || r.source === 'ESTIMATE').map(r => r.metric);
  let mode: BudgetMode = 'NORMAL';
  const reasons: string[] = [];
  for (const r of current.values()) {
    const ratio = r.used / r.limit;
    const next = ratio >= .95 ? 'STOP' : ratio >= .85 ? 'CRITICAL' : ratio >= .7 || (r.projected ?? 0) > r.limit * .8 ? 'SAVING' : 'NORMAL';
    const order = { NORMAL: 0, UNKNOWN: 1, SAVING: 2, CRITICAL: 3, STOP: 4 };
    if (order[next] > order[mode]) mode = next;
    if (next !== 'NORMAL') reasons.push(`${r.metric}:${next}`);
  }
  if (mode === 'NORMAL' && (missing.length || stale.length)) mode = 'UNKNOWN';
  return { mode, asOf: now.toISOString(), rows: [...current.values()], missing, stale, reasons,
    limitedReason: mode === 'NORMAL' ? null : reasons.join(', ') || 'MISSING_OR_STALE_RESOURCE_READING' };
}

/** Unknown jobs fail closed only in critical modes; settlement remains explicit. */
export function budgetAllowsJob(mode: BudgetMode, job: string, now = new Date()) {
  if (mode === 'STOP') return false;
  if (mode === 'NORMAL') return true;
  if (mode === 'CRITICAL') return ['settle-results','settle-tips','daily-selection-settle','snapshot-odds-priority'].includes(job);
  if (['personnel-shadow','player-profiles','refresh-tactics','collect-live','send-notifications','pressure-research'].includes(job)) return false;
  if (['audit-pipeline','calibrate-models'].includes(job)) return now.getUTCHours() >= 22;
  return true;
}
