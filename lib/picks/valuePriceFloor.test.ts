import { describe, expect, it } from 'vitest';
import { INTUITION_POLICY_VERSION, minimumValueCombinationOdds } from './intuitionTickets';
const input = { modelProbability: .6, decimalOdds: 2, conditionRetention: .9, conditionOddsUplift: 1.5, priceKind: 'DIRECT' as const, decisionPolicyVersion: INTUITION_POLICY_VERSION };
describe('VALUE price-only floor', () => {
  it('uses raw EV and the price-dependent conservative anchor', () => {
    expect(minimumValueCombinationOdds(input)).toBe(1.8);
    expect(.4 * (.6 * 1.8 - 1)).toBeGreaterThanOrEqual(.03);
  });
  it('keeps the same-book condition efficiency gate and rounds upward', () => {
    expect(minimumValueCombinationOdds({ ...input, conditionOddsUplift: 1.25, conditionRetention: .8 })).toBe(2.06);
  });
  it('fails closed for missing audit, wrong policy, synthetic prices and excessive floor', () => {
    for (const patch of [{ conditionRetention: null }, { decisionPolicyVersion: 10 }, { priceKind: 'SYNTHETIC' as const }, { modelProbability: .1 }, { modelProbability: NaN }])
      expect(minimumValueCombinationOdds({ ...input, ...patch })).toBeNull();
  });
});
