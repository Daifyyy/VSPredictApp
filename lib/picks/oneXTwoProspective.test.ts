import { describe, expect, it } from 'vitest';
import { evaluateOneXTwoProspective, type ProspectiveRow } from './oneXTwoProspective';
import { oneXTwoProspectiveQuery } from '../data/oneXTwoProspectiveQuery';

const now = new Date('2026-10-23T12:00:00Z');
function row(id = 1): ProspectiveRow {
  return { id: String(id), fixtureId: id, leagueId: 39, kickoff: new Date('2026-10-22T18:00:00Z'), openedAt: new Date('2026-10-21T12:00:00Z'),
    modelVersion: 7, contextVersion: 1, modelContext: 'LEAGUE', homeTeamId: 1, awayTeamId: 2, resultKickoff: new Date('2026-10-22T18:00:00Z'),
    status: 'FT', homeGoals: 1, awayGoals: 1, audit: { version: 1, fixtureId: id, homeTeamId: 1, awayTeamId: 2, modelVersion: 7, contextVersion: 1, modelContext: 'LEAGUE',
      kickoff: '2026-10-22T18:00:00Z', capturedAt: '2026-10-21T12:00:00Z', predictedAt: '2026-10-21T10:00:00Z', model: [.4, .4, .2], market: [.5, .3, .2],
      quality: 'PANEL', method: 'NORMALIZED_PANEL_LOGIT_MEDIAN_1X2_V1', modelParameters: { rho: -.13, sharpen: 1, calibA: 1, calibB: 0 } } };
}
function changeAudit(r: ProspectiveRow, change: Record<string, unknown>) { return { ...r, audit: { ...(r.audit as object), ...change } }; }
describe('prospective full-vector 1X2 audit', () => {
  it('scores all outcomes including a draw against identical market rows', () => {
    const r = evaluateOneXTwoProspective([row()], now);
    expect(r.coverage.settled).toBe(1);
    const p = r.cohorts[0].panel;
    expect(p.model.logLoss).toBeCloseTo(-Math.log(.4));
    expect(p.market.logLoss).toBeCloseTo(-Math.log(.3));
    expect(p.logLossDelta).toBeLessThan(0);
    expect(p.model.brier).toBeCloseTo(.56);
    expect(p.model.classCalibration[1].observed).toBe(1);
    expect(p.model.n).toBe(p.market.n);
  });
  it('keeps missing and single-book benchmarks out of the panel comparison', () => {
    const r = evaluateOneXTwoProspective([row(), changeAudit(row(2), { market: null }), changeAudit(row(3), { quality: 'PINNACLE_SINGLE' })], now);
    expect(r.cohorts[0].allModel.n).toBe(3);
    expect(r.cohorts[0].panel.n).toBe(1);
    expect(r.cohorts[0].pinnacleSingle.n).toBe(1);
    expect(r.coverage.missingMarket).toBe(1);
  });
  it('does not choose a later valid audit when the original is absent', () => {
    const first = { ...row(), audit: null };
    const later = { ...changeAudit(row(), { capturedAt: '2026-10-21T13:00:00Z' }), id: 'second', openedAt: new Date('2026-10-21T13:00:00Z') };
    const r = evaluateOneXTwoProspective([later, first], now);
    expect(r.cohorts).toEqual([]);
    expect(r.reasons).toEqual({ AUDIT_NOT_CAPTURED: 1, DUPLICATE_FIXTURE: 1 });
  });
  it.each([
    [{ predictedAt: '2026-10-22T20:00:00Z' }, 'INVALID_POINT_IN_TIME'],
    [{ capturedAt: '2026-10-22T18:00:00Z' }, 'INVALID_POINT_IN_TIME'],
    [{ model: [.5, .4, .2] }, 'INVALID_MODEL_VECTOR'],
    [{ modelVersion: 8 }, 'VERSION_MISMATCH'],
    [{ contextVersion: 2 }, 'VERSION_MISMATCH'],
    [{ homeTeamId: 8 }, 'IDENTITY_OR_KICKOFF_MISMATCH'],
    [{ modelParameters: {} }, 'PARAMETERS_NOT_CAPTURED'],
  ])('rejects invalid audit %j', (change, reason) => {
    expect(evaluateOneXTwoProspective([changeAudit(row(), change)], now).reasons[reason]).toBe(1);
  });
  it('never scores pending, extra-time or incomplete finals as regulation outcomes', () => {
    const r = evaluateOneXTwoProspective([{ ...row(), status: 'NS' }, { ...row(2), status: 'AET' }, { ...row(3), homeGoals: null }], now);
    expect(r.coverage.settled).toBe(0);
    expect(r.coverage.pendingOrNonRegulationFinal).toBe(2);
    expect(r.reasons.FINAL_SCORE_MISSING).toBe(1);
  });
  it('rejects a postponed kickoff instead of reusing its original forecast', () => {
    expect(evaluateOneXTwoProspective([{ ...row(), resultKickoff: new Date('2026-10-23T18:00:00Z') }], now).reasons.IDENTITY_OR_KICKOFF_MISMATCH).toBe(1);
  });
  it('separates post-parameter changes even within the same model version', () => {
    const r = evaluateOneXTwoProspective([row(), changeAudit(row(2), { modelParameters: { rho: -.13, sharpen: 1.1, calibA: 1, calibB: 0 } })], now);
    expect(r.cohorts).toHaveLength(2);
  });
  it('keeps zero probabilities finite and does not invent empty evidence', () => {
    const r = evaluateOneXTwoProspective([changeAudit(row(), { model: [1, 0, 0], market: null })], now);
    expect(Number.isFinite(r.cohorts[0].allModel.logLoss)).toBe(true);
    expect(r.cohorts[0].panel.model.logLoss).toBeNull();
    expect(evaluateOneXTwoProspective([], now).cohorts).toEqual([]);
  });
  it('bounds database work and removes raw quote payloads', () => {
    const query = oneXTwoProspectiveQuery(new Date('2026-10-01'), now).sql;
    expect(query).toContain('LIMIT 10001');
    expect(query).toContain('NOT EXISTS');
    expect(query).toContain("- 'quotes'");
    expect(query).not.toContain('inputSnapshot');
    expect(() => oneXTwoProspectiveQuery(new Date('2025-01-01'), now)).toThrow('AUDIT_WINDOW_MAX_93_DAYS');
  });
});
