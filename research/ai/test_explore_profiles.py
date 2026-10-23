import copy
import unittest
from explore_profiles import prepare, folds, PROTOCOL

class ExplorationTests(unittest.TestCase):
    def data(self):
        days = ['2026-01-16', '2026-01-17', '2026-02-14', '2026-02-15',
                '2026-03-13', '2026-03-14', '2026-04-19', '2026-04-20', '2026-08-01']
        return dict(version=2, kind='QUALITY_RECONSTRUCTION_ONLY', trainingAllowed=False,
                    featureNames=['a'], featureGroups=[1], rows=[dict(fixtureId=i+1, day=d, kickoff=d+'T18:00:00Z',
                    profileMode='ADVANCED', latestHistory=None, outcome=i%3, over=i%2) for i,d in enumerate(days)])

    def test_no_calibration_or_terminal_rows(self):
        source=self.data(); original=copy.deepcopy(source); matrix=prepare(source)
        self.assertEqual(source, original)
        self.assertEqual(len(matrix['rows']), 7)
        self.assertFalse(matrix['activation'])
        self.assertFalse(matrix['independentHoldout'])

    def test_same_cohort_and_disjoint_validations(self):
        source=self.data(); source['rows'][1]['profileMode']='BASE'
        rows=prepare(source)['rows']; seen=set()
        for train, valid in folds(rows):
            self.assertTrue(set(train).isdisjoint(valid))
            self.assertTrue(seen.isdisjoint(valid)); seen.update(valid)
            for t in train:
                for v in valid: self.assertLess(rows[t]['day'], rows[v]['day'])
        self.assertTrue(all(r['profileMode']=='ADVANCED' for r in rows))

    def test_later_labels_cannot_change_development_matrix(self):
        source=self.data(); changed=copy.deepcopy(source)
        for r in changed['rows']:
            if r['day']>PROTOCOL['developmentThrough']: r['outcome']=99; r['over']=99
        self.assertEqual(prepare(source),prepare(changed))

    def test_reject_wrong_contract_and_leakage(self):
        source=self.data(); source['trainingAllowed']=True
        with self.assertRaisesRegex(RuntimeError,'CONTRACT'): prepare(source)
        source=self.data(); source['rows'][0]['latestHistory']='2026-01-16T12:00:00Z'
        with self.assertRaisesRegex(RuntimeError,'LEAKAGE'): prepare(source)

if __name__=='__main__': unittest.main()
