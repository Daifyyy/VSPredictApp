import { NextResponse } from 'next/server';
import { budgetAllowsJob } from './resourceBudget';

/** Explicit rollout switch. Emergency stop does not need a database connection. */
export async function resourceBudgetGuard(job: string): Promise<NextResponse | null> {
  if (process.env.RESOURCE_BUDGET_FORCE_STOP === 'true') {
    return limited('STOP', 'MANUAL_EMERGENCY_STOP');
  }
  if (process.env.RESOURCE_BUDGET_ENFORCEMENT_ENABLED !== 'true') return null;
  try {
    const { readResourceBudget } = await import('./data/resourceBudgetStore');
    const state = await readResourceBudget();
    return budgetAllowsJob(state.mode, job) ? null : limited(state.mode, state.limitedReason);
  } catch {
    // Failed quota reads must not start expensive jobs or induce automatic HTTP retries.
    return limited('UNKNOWN', 'RESOURCE_READING_UNAVAILABLE');
  }
}
function limited(mode: string, reason: string | null) {
  return NextResponse.json({ status: 'RESOURCE_LIMITED', processed: 0, mode,
    asOf: new Date().toISOString(), stale: true, limitedReason: reason },
    { headers: { 'Cache-Control': 'no-store' } });
}
