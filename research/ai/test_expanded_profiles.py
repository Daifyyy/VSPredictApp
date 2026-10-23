import copy
import unittest
from unittest.mock import patch
import explore_expanded_profiles as expanded

class ExpandedTests(unittest.TestCase):
    def source(self):
        days=['2024-09-01','2026-01-16','2026-01-17','2026-02-15','2026-03-14','2026-04-20']
        return dict(version=2,kind='EXPANDED_DEVELOPMENT_RECONSTRUCTION',trainingAllowed=False,
                    featureNames=['x'],featureGroups=[1],rows=[dict(fixtureId=i+1,day=d,kickoff=d+'T18:00:00Z',
                    latestHistory=None,profileMode='ADVANCED',outcome=i%3,over=i%2) for i,d in enumerate(days)])

    @patch.object(expanded, 'cohort_ids', return_value={3,4,5})
    def test_added_history_never_changes_fixed_validation_membership(self, _mock):
        rows=self.source()['rows']; parts=expanded.folds(rows)
        self.assertEqual([v for _,v in parts],[[2],[3],[4]])
        self.assertTrue(all(0 in t for t,_ in parts))
        self.assertTrue(all(5 not in t+v for t,v in parts))

    @patch.object(expanded, 'cohort_ids', return_value={3,4,5})
    @patch.object(expanded, 'COHORT_REPORT')
    def test_missing_ready_validation_fails_closed(self, report, _mock):
        report.read_bytes.return_value=b'fixture-ids'
        source=self.source(); source['rows'][2]['profileMode']='BASE'
        with self.assertRaisesRegex(RuntimeError,'MISSING_COMMON'): expanded.prepare(source)

    @patch.object(expanded, 'cohort_ids', return_value={3,4,5})
    @patch.object(expanded, 'COHORT_REPORT')
    def test_future_labels_excluded_and_parent_not_mutated(self, report, _mock):
        report.read_bytes.return_value=b'fixture-ids'
        source=self.source(); before=copy.deepcopy(source); changed=copy.deepcopy(source)
        changed['rows'][-1]['outcome']=99
        self.assertEqual(expanded.prepare(source),expanded.prepare(changed))
        self.assertEqual(source,before)
        self.assertFalse(expanded.prepare(source)['activation'])

if __name__=='__main__': unittest.main()
