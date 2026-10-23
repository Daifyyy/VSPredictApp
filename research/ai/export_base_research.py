"""One fixed fit for explicitly authorized research, NOT a statistical approval."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / '.runtime/ai-expanded-development/804ce78706a7c4151743d05d5d4ae6d9d59f00b890c6593f9d4ac60b7b0c65f1.dataset.json'
OUTPUT = ROOT / '.runtime/ai-base-research-export-v1'
PROTOCOL = dict(version=1, market='OVER_25', kind='LOGISTIC', C=1, seed=20261023,
                maxFits=1, maxSeconds=120, cutoff='2026-04-19', mode='MANUAL_RESEARCH', temperature=1)

def worker():
    import numpy as np
    import train
    raw = SOURCE.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if SOURCE.name != digest + '.dataset.json': raise RuntimeError('DATASET_HASH_MISMATCH')
    data = json.loads(raw)
    if data['kind'] != 'EXPANDED_DEVELOPMENT_RECONSTRUCTION': raise RuntimeError('INVALID_DATASET')
    # Exactly the BASE candidate's development population, no old calibration/terminal.
    rows = [r for r in data['rows'] if r['day'] <= PROTOCOL['cutoff'] and r['profileMode'] == 'ADVANCED']
    train.audit_rows(rows)
    if len(rows) < 1000: raise RuntimeError('INSUFFICIENT_TRAINING')
    columns = [i for i, g in enumerate(data['featureGroups']) if g == 1]
    x = np.array([r['values'] for r in rows], dtype=float)[:, columns]
    fitted = train.fit_model(x, np.array([r['over'] for r in rows]), PROTOCOL, PROTOCOL)
    artifact = train.export_model(fitted, PROTOCOL, columns, data['featureNames'], 1, digest,
                                  hashlib.sha256(json.dumps(PROTOCOL, sort_keys=True).encode()).hexdigest(), OUTPUT)
    artifact.update(status='MANUAL_RESEARCH', trainingThrough=PROTOCOL['cutoff'], featureSchemaVersion=2,
                    artifactId='base-over-logistic-research-v1', historyStartSeason=2024,
                    leagueIds=[39, 61, 78, 135, 140], policyVersion=1, calibration='UNCALIBRATED_T1',
                    statisticalGatePassed=False, trainingRows=len(rows))
    raw_artifact = json.dumps(artifact, separators=(',', ':'), allow_nan=False)
    if len(raw_artifact.encode()) > 1_000_000: raise RuntimeError('ARTIFACT_TOO_LARGE')
    (OUTPUT/'artifact.json').write_text(raw_artifact, encoding='utf8')
    cases = [r['values'] for r in rows[::max(1, len(rows)//100)]] + [[None]*len(data['featureNames'])]
    probabilities = train.predict(fitted, np.array(cases, dtype=float)[:, columns])[:, 1].tolist()
    (OUTPUT/'parity.json').write_text(json.dumps(dict(cases=cases, probabilities=probabilities)), encoding='utf8')

def main():
    if sys.argv[1:] == ['--worker']: return worker()
    if sys.argv[1:]: raise RuntimeError('NO_DYNAMIC_CONFIGURATION')
    import psutil
    from supervise import stop_tree
    if psutil.virtual_memory().available < 2*1024**3: raise RuntimeError('INSUFFICIENT_FREE_RAM')
    OUTPUT.mkdir()  # Never overwrite a run.
    env = {k:v for k,v in os.environ.items() if not any(s in k.upper() for s in ('DATABASE', 'TOKEN', 'SECRET', 'API_KEY'))}
    for k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'): env[k] = '2'
    started = time.monotonic(); peak = 0
    with (OUTPUT/'worker.log').open('w', encoding='utf8') as log:
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker'], env=env,
                                   stdout=log, stderr=subprocess.STDOUT,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            while process.poll() is None:
                try:
                    p = psutil.Process(process.pid)
                    rss = psutil.Process().memory_info().rss + sum(c.memory_info().rss for c in [p]+p.children(recursive=True) if c.is_running())
                    peak = max(peak, rss)
                    if rss > 4*1024**3 or psutil.virtual_memory().available < 2*1024**3 or time.monotonic()-started > 120:
                        raise RuntimeError('BUDGET_EXCEEDED')
                except psutil.NoSuchProcess: pass
                time.sleep(.25)
        except BaseException:
            stop_tree(process); raise
        process.wait()
    report = dict(status='EXPORTED_MANUAL_RESEARCH' if process.returncode == 0 else 'FAILED',
                  seconds=time.monotonic()-started, peakRssBytes=peak, databaseQueries=0, providerCalls=0)
    (OUTPUT/'report.json').write_text(json.dumps(report), encoding='utf8'); print(json.dumps(report))
    if process.returncode: sys.exit(1)

if __name__ == '__main__': main()
