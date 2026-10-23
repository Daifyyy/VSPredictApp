"""No fitting or database access; safe to run alongside the supervised pilot."""
import unittest
from datetime import date, timedelta
import numpy as np
from train import audit_rows, temporal_split, metrics, impute_fit, impute, segmentation

class ProtocolTests(unittest.TestCase):
    def rows(self):
        return [dict(fixtureId=i+1,day=str(date(2024,1,1)+timedelta(days=i//2)),
                     kickoff=str(date(2024,1,1)+timedelta(days=i//2))+'T18:00:00Z',
                     latestHistory=None,outcome=i%3,over=i%2) for i in range(200)]

    def test_whole_day_partition(self):
        rows=self.rows(); folds,dev,cal,terminal=temporal_split(rows)
        self.assertEqual((len(dev),len(cal),len(terminal)),(140,20,40))
        for train,valid in folds:
            self.assertLess(rows[int(train[-1])]['day'],rows[int(valid[0])]['day'])
        self.assertTrue(set(dev).isdisjoint(cal))
        self.assertTrue(set(cal).isdisjoint(terminal))

    def test_future_labels_do_not_change_partitions(self):
        a=self.rows(); b=[dict(r,outcome=0,over=0) if i>=140 else r for i,r in enumerate(a)]
        first=temporal_split(a); second=temporal_split(b)
        for x,y in zip(first[0],second[0]):
            for left,right in zip(x,y): np.testing.assert_array_equal(left,right)
        for x,y in zip(first[1:],second[1:]): np.testing.assert_array_equal(x,y)

    def test_temporal_audit_and_duplicate(self):
        rows=self.rows(); audit_rows(rows)
        with self.assertRaisesRegex(RuntimeError,'DUPLICATE'): audit_rows(rows+[rows[0]])
        rows[0]['latestHistory']='2023-12-31T21:00:00Z'
        with self.assertRaisesRegex(RuntimeError,'LEAKAGE'): audit_rows(rows)
        rows[0]['latestHistory']='2023-12-31T20:59:59Z'; audit_rows(rows)

    def test_train_only_imputation(self):
        med=impute_fit(np.array([[1.,np.nan],[3.,np.nan]]))
        np.testing.assert_array_equal(med,[2.,0.])
        np.testing.assert_array_equal(impute(np.array([[np.nan,999.]]),med),[[2.,999.]])

    def test_binary_and_three_class_metrics(self):
        binary=metrics(np.array([0,1]),np.array([[.8,.2],[.2,.8]]))
        self.assertAlmostEqual(binary['brier'],.04)
        self.assertAlmostEqual(binary['accuracy'],1)
        self.assertAlmostEqual(binary['logLoss'],-np.log(.8))
        multi=metrics(np.array([0,1,2]),np.eye(3))
        self.assertEqual(multi['brier'],0)
        self.assertEqual(multi['ece'],[0,0,0])

    def test_segment_minimum_is_not_missing_as_success(self):
        y=np.zeros(100,dtype=int); good=np.tile([.8,.2],(100,1)); bad=np.tile([.7,.3],(100,1))
        result=segmentation(y,bad,good,np.ones(100),dict(segmentMinN=100,segmentMaxLoss=.02))
        self.assertFalse(result[0]['acceptable'])
        self.assertEqual(segmentation(y[:99],bad[:99],good[:99],np.ones(99),dict(segmentMinN=100,segmentMaxLoss=.02)),[])

if __name__=='__main__': unittest.main()
