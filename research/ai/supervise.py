"""External process-tree budget enforcement. Explicit local invocation only."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import psutil

def stop_tree(process):
    try:
        parent = psutil.Process(process.pid); tree = parent.children(recursive=True) + [parent]
        for p in tree:
            try: p.terminate()
            except psutil.NoSuchProcess: pass
        _, alive = psutil.wait_procs(tree,timeout=5)
        for p in alive:
            try: p.kill()
            except psutil.NoSuchProcess: pass
    except psutil.NoSuchProcess: pass

def main():
    root=Path(__file__).resolve().parents[2]; cache=(root/'.runtime'/'ai-research').resolve()
    source=Path(sys.argv[1]).resolve()
    if not source.is_relative_to(cache) or not source.name.endswith('.dataset.json'): raise RuntimeError('INVALID_DATASET_PATH')
    raw=source.read_bytes(); dataset=json.loads(raw); protocol=dataset['protocol']
    expected = {'maxFits':80,'maxSeconds':5400,'threads':2,'maxRssBytes':4*1024**3,'minFreeBytes':2*1024**3,'maxCacheBytes':1024**3}
    if any(protocol.get(k)!=v for k,v in expected.items()): raise RuntimeError('UNSUPPORTED_BUDGET_PROTOCOL')
    code_hash=hashlib.sha256(Path(__file__).with_name('train.py').read_bytes()+Path(__file__).read_bytes()).hexdigest()
    run_id=hashlib.sha256(raw+code_hash.encode()).hexdigest()
    output=cache/run_id
    if output.exists(): raise RuntimeError('RUN_EXISTS_DO_NOT_OVERWRITE')
    total=sum(p.stat().st_size for p in cache.rglob('*') if p.is_file())
    if total>protocol['maxCacheBytes']: raise RuntimeError('CACHE_BUDGET_EXCEEDED')
    if psutil.virtual_memory().available<protocol['minFreeBytes']: raise RuntimeError('INSUFFICIENT_FREE_RAM')
    output.mkdir()
    (output/'provenance.json').write_text(json.dumps({'datasetHash':hashlib.sha256(raw).hexdigest(),'codeHash':code_hash,'protocolHash':dataset['protocolHash']}),encoding='utf8')
    started=time.monotonic(); peak=0; reason=None
    env={k:v for k,v in os.environ.items() if not any(s in k.upper() for s in ('DATABASE_URL','API_KEY','TOKEN','SECRET'))}
    with (output/'worker.log').open('w',encoding='utf8') as log:
        process=subprocess.Popen([sys.executable,str(Path(__file__).with_name('train.py')),str(source),str(output)],stdout=log,stderr=subprocess.STDOUT,env=env,
                                 creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        try:
          while process.poll() is None:
            try:
                parent=psutil.Process(process.pid); tree=[parent]+parent.children(recursive=True)
                rss=sum(p.memory_info().rss for p in tree if p.is_running()); peak=max(peak,rss)
                if rss>protocol['maxRssBytes'] or psutil.virtual_memory().available<protocol['minFreeBytes'] or time.monotonic()-started>protocol['maxSeconds']:
                    reason='BUDGET_EXCEEDED'
                    stop_tree(process)
                    break
            except psutil.NoSuchProcess: pass
            time.sleep(1)
        except BaseException:
            stop_tree(process)
            raise
        process.wait()
    telemetry={'status':reason or ('COMPLETED' if process.returncode==0 else 'FAILED'),'peakRssBytes':peak,'seconds':time.monotonic()-started,'output':str(output)}
    (output/'telemetry.json').write_text(json.dumps(telemetry,indent=2),encoding='utf8'); print(json.dumps(telemetry),flush=True)
    if reason or process.returncode: sys.exit(1)

if __name__=='__main__': main()
