"""Explicit exploratory paired comparison, not the activation pilot. Default entry is supervised."""
import os
for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
    os.environ[key] = '2'
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
PARENT = ROOT / '.runtime/ai-quality-v2/cabca0a635219d7d1eba6984116e9c79b12461e764545e2e44d9a12edb529861.dataset.json'
PROTOCOL = dict(version=1, kind='EXPLORATORY_PAIRED_PROFILES', activation=False,
                independentHoldout=False, model='LOGISTIC', C=1, seed=20261023,
                maxFits=12, maxSeconds=600, maxRssBytes=4*1024**3, minFreeBytes=2*1024**3,
                developmentThrough='2026-04-19', minEvidenceTrain=1000,
                folds=[['2026-01-16', '2026-02-14'], ['2026-02-14', '2026-03-13'], ['2026-03-13', '2026-04-19']])

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def prepare(data):
    if data.get('version') != 2 or data.get('kind') != 'QUALITY_RECONSTRUCTION_ONLY' or data.get('trainingAllowed') is not False:
        raise RuntimeError('INVALID_PARENT_CONTRACT')
    # New explicitly exploratory contract. Never modify the parent's training permission.
    rows = [r for r in data['rows'] if r['day'] <= PROTOCOL['developmentThrough'] and r['profileMode'] == 'ADVANCED']
    rows.sort(key=lambda r: (r['day'], r['fixtureId']))
    from train import audit_rows
    audit_rows(rows)
    return dict(version=1, kind=PROTOCOL['kind'], activation=False, independentHoldout=False,
                protocol=PROTOCOL, featureNames=data['featureNames'], featureGroups=data['featureGroups'], rows=rows)

def folds(rows):
    return [([i for i, r in enumerate(rows) if r['day'] <= end],
             [i for i, r in enumerate(rows) if end < r['day'] <= valid_end])
            for end, valid_end in PROTOCOL['folds']]

def worker(source, output):
    import numpy as np
    import train
    raw = source.read_bytes(); data = json.loads(raw)
    if source.name != digest(raw)+'.matrix.json' or data['protocol'] != PROTOCOL or data['kind'] != PROTOCOL['kind']:
        raise RuntimeError('INVALID_EXPLORATORY_MATRIX')
    rows = data['rows']; train.audit_rows(rows)
    if any(r['day'] > PROTOCOL['developmentThrough'] or r['profileMode'] != 'ADVANCED' for r in rows):
        raise RuntimeError('FORBIDDEN_EVALUATION_ROW')
    x = np.array([r['values'] for r in rows], dtype=float)
    groups = np.array(data['featureGroups'])
    if x.ndim != 2 or x.shape[1] != len(groups) or np.isinf(x).any(): raise RuntimeError('INVALID_MATRIX')
    report = dict(protocol=PROTOCOL, matrixHash=digest(raw), parentDatasetHash=data['parentDatasetHash'],
                  status='EXPLORATORY_ONLY', activation=False, independentHoldout=False,
                  roi=None, clv=None, markets={}, completedFits=0,
                  caveats=['Previously explored development cohort; no independent test.',
                           'First folds have fewer than 1000 training matches; evidence gate NOT passed.',
                           'No historical executable prices. No ROI or CLV claim.',
                           'No new calibration, feature selection, hyperparameter search or model export.',
                           'Source publication time and neutral venue unverified.'])
    def checkpoint():
        (output/'report.partial.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    for market in ('ONE_X_TWO', 'OVER_25'):
        y = np.array([r['outcome' if market == 'ONE_X_TWO' else 'over'] for r in rows])
        pooled = {name: [] for name in ('MAIN', 'LEAGUE', 'BASE', 'ADVANCED')}
        actual, leagues, fixture_ids, fold_reports = [], [], [], []
        for ti, vi in folds(rows):
            if not ti or not vi: raise RuntimeError('EMPTY_FOLD')
            if any((y[ti] == c).sum() < 20 for c in range(3 if market == 'ONE_X_TWO' else 2)):
                raise RuntimeError('INSUFFICIENT_CLASS_SUPPORT')
            fold = dict(trainN=len(ti), validationN=len(vi), evidenceTrainMinimumMet=len(ti)>=1000, metrics={})
            for name, key in (('MAIN', 'baseline'), ('LEAGUE', 'leagueBaseline')):
                p = np.array([rows[i][key]['oneXTwo'] if market == 'ONE_X_TWO' else
                              [1-rows[i][key]['over'], rows[i][key]['over']] for i in vi])
                pooled[name].append(p); fold['metrics'][name] = train.metrics(y[vi], p)
            for name, columns in (('BASE', np.where(groups == 1)[0]), ('ADVANCED', np.arange(len(groups)))):
                fitted = train.fit_model(x[ti][:, columns], y[ti], dict(kind='LOGISTIC', market=market, C=1), PROTOCOL)
                p = train.predict(fitted, x[vi][:, columns])
                pooled[name].append(p); fold['metrics'][name] = train.metrics(y[vi], p)
                report['completedFits'] = train.FITS; checkpoint()
            actual.extend(y[vi].tolist()); leagues.extend(rows[i]['leagueId'] for i in vi)
            fixture_ids.extend(rows[i]['fixtureId'] for i in vi); fold_reports.append(fold)
        if len(set(fixture_ids)) != len(fixture_ids): raise RuntimeError('DUPLICATE_OOF_FIXTURE')
        ys = np.array(actual); ls = np.array(leagues)
        predictions = {name: np.concatenate(parts) for name, parts in pooled.items()}
        summary = {name: train.metrics(ys, p) for name, p in predictions.items()}
        report['markets'][market] = dict(metrics=summary, folds=fold_reports, validationFixtureIds=fixture_ids,
            segments={name: train.segmentation(ys, predictions[name], predictions['MAIN'], ls,
                                               dict(segmentMinN=100, segmentMaxLoss=.02)) for name in ('BASE', 'ADVANCED')},
            advancedRelativeGainOverBase=1-summary['ADVANCED']['logLoss']/summary['BASE']['logLoss'])
        checkpoint()
    (output/'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')

def main():
    import psutil
    from supervise import stop_tree
    if len(sys.argv) > 1:
        if len(sys.argv) == 4 and sys.argv[1] == '--worker':
            worker(Path(sys.argv[2]), Path(sys.argv[3])); return
        raise RuntimeError('NO_TUNING_ARGUMENTS')
    if PARENT.stat().st_size > 32*1024**2: raise RuntimeError('INPUT_BUDGET')
    raw = PARENT.read_bytes()
    if PARENT.name != digest(raw)+'.dataset.json': raise RuntimeError('PARENT_HASH_MISMATCH')
    if psutil.virtual_memory().available < PROTOCOL['minFreeBytes']: raise RuntimeError('INSUFFICIENT_FREE_RAM')
    data = prepare(json.loads(raw)); data['parentDatasetHash'] = digest(raw)
    matrix = json.dumps(data, separators=(',', ':')).encode()
    code = b''.join(Path(__file__).with_name(f).read_bytes() for f in ('explore_profiles.py', 'train.py', 'supervise.py'))
    run_hash = digest(matrix+code)
    root = ROOT/'.runtime/ai-profile-exploration'
    root.mkdir(exist_ok=True)
    if root.resolve() != root.absolute(): raise RuntimeError('UNSAFE_OUTPUT_PATH')
    if sum(p.stat().st_size for p in root.rglob('*') if p.is_file()) + len(matrix) > 128*1024**2:
        raise RuntimeError('CACHE_BUDGET')
    output = root/run_hash; output.mkdir()  # Existing run must never be overwritten.
    source = output/(digest(matrix)+'.matrix.json'); source.write_bytes(matrix)
    (output/'provenance.json').write_text(json.dumps(dict(parentHash=digest(raw), codeHash=digest(code), protocol=PROTOCOL)), encoding='utf8')
    env = {k:v for k,v in os.environ.items() if not any(s in k.upper() for s in ('DATABASE', 'API_KEY', 'TOKEN', 'SECRET'))}
    started = time.monotonic(); peak = 0; reason = None
    with (output/'worker.log').open('w', encoding='utf8') as log:
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', str(source), str(output)],
            stdout=log, stderr=subprocess.STDOUT, env=env, creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        try:
            while process.poll() is None:
                try:
                    parent = psutil.Process(process.pid)
                    rss = psutil.Process().memory_info().rss + sum(p.memory_info().rss for p in [parent]+parent.children(recursive=True) if p.is_running())
                    peak = max(peak, rss)
                    if rss > PROTOCOL['maxRssBytes'] or psutil.virtual_memory().available < PROTOCOL['minFreeBytes'] or time.monotonic()-started > PROTOCOL['maxSeconds']:
                        reason='BUDGET_EXCEEDED'; stop_tree(process); break
                except psutil.NoSuchProcess: pass
                time.sleep(.25)
        except BaseException:
            stop_tree(process); raise
        process.wait()
    telemetry = dict(status=reason or ('COMPLETED' if process.returncode==0 else 'FAILED'), peakRssBytes=peak,
                     seconds=time.monotonic()-started, output=str(output), databaseQueries=0, providerCalls=0)
    (output/'telemetry.json').write_text(json.dumps(telemetry, indent=2), encoding='utf8')
    print(json.dumps(telemetry), flush=True)
    if reason or process.returncode: sys.exit(1)

if __name__ == '__main__': main()
