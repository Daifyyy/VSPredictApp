import unittest
from audit_data_and_over import audit, binary, date, wilson

class AuditTests(unittest.TestCase):
    def test_timestamps_are_compared_as_instants(self):
        self.assertEqual(date('2026-01-01T12:00:00Z'),date('2026-01-01T12:00:00.000Z'))

    def test_metric_and_uncertainty(self):
        self.assertAlmostEqual(binary([.8,.2],[1,0])['brier'],.04)
        lo,hi=wilson(40,56); self.assertLess(lo,40/56); self.assertGreater(hi,40/56)
        with self.assertRaises(AssertionError): binary([.5],[1,0])

    def test_actual_sources_reconcile(self):
        r=audit()
        self.assertTrue(all(v==0 for v in r['invariants'].values()))
        self.assertEqual(r['joinErrors'],[])
        self.assertEqual(r['inventoryConflicts'],[])
        self.assertEqual(r['resultMismatches'],[])
        self.assertEqual(sum(x['n'] for x in r['byLeague'].values()),r['profile']['n'])
        self.assertEqual(sum(x['n'] for x in r['byPartition'].values()),r['profile']['n'])
        self.assertEqual(r['pairedPolicies']['maxProbabilityDifference'],0)
        for c in r['cohorts'].values():
            self.assertEqual(c['pairedModel']['n'],c['pairedMarket']['n'])
            self.assertEqual(c['n'],c['fixtures'])
            self.assertAlmostEqual(c['roi']*c['n'],c['profitUnits'])

if __name__=='__main__': unittest.main()
